import { EventEmitter } from "events";
import {
  FetchDataTypeName,
  FetchDataType,
  FetchResult,
  fetchDataType,
} from "../common/fetchdatatype";
import WebGL from "./gl/gl";
import Scene from "./scene";
import { Resource } from "./resource";
import {
  PathSolver,
  HandlerResourceData,
  HandlerResource,
  SolverParams,
} from "./handlerresource";
import GenericResource from "./genericresource";
import ClientBuffer from "./gl/clientbuffer";
import { isImageSource, ImageTexture, detectMime } from "./imagetexture";
import { blobToImage } from "../common/canvas";

export enum DebugRenderMode {
  None,
  Diffuse,
  NormalMap,
  Occlusion,
  Roughness,
  Metallic,
  TCFactor,
  Emissive,
  TexCoords,
  Normals,
  Tangents,
}

/**
 * A viewer handler.
 */
export interface Handler {
  load?: (viewer: ModelViewer, ...args: any[]) => void;
  isValidSource: (src: unknown) => boolean;
  resource: new (
    src: any,
    resourceData: HandlerResourceData
  ) => HandlerResource;
}

/**
 * A model viewer.
 */
export default class ModelViewer extends EventEmitter {
  /**
   * The viewer's canvas.
   */
  canvas: HTMLCanvasElement;
  /**
   * The viewer's WebGL context.
   */
  gl: WebGLRenderingContext;
  /**
   * A wrapper around the viewer's WebGL context with utility functions.
   */
  webgl: WebGL;
  /**
   * All of the loaded resources.
   */
  resources: Resource[] = [];
  /**
   * A map from urls to their resources.
   *
   * Only used by fetched resources.
   */
  resourceMap: Map<string, Resource> = new Map();
  /**
   * A map from urls to the promises that load them.
   *
   * Only used by fetched resources.
   */
  promiseMap: Map<string, Promise<Resource | undefined>> = new Map();
  /**
   * The viewer's handlers, added with `addHandler()`.
   */
  handlers: Set<Handler> = new Set();
  /**
   * The viewer's scenes, added with `addScene()`.
   */
  scenes: Scene[] = [];
  /**
   * The current frame.
   */
  frame = 0;
  /**
   * The number of visible cells on the current frame.
   */
  visibleCells = 0;
  /**
   * The number of visible instances on the current frame.
   */
  visibleInstances = 0;
  /**
   * The number of particles being updated on the current frame.
   */
  updatedParticles = 0;
  /**
   * A viewer-wide flag.
   *
   * If it is false, not only will audio not run, but in fact audio files won't even be fetched in the first place.
   *
   * If audio is desired, this should be set to true before loading models that use audio.
   *
   * Note that it is preferable to call enableAudio(), which checks for the existence of AudioContext.
   */
  audioEnabled = false;
  /**
   * A resizeable buffer that can be used by any part of the library.
   *
   * The data it contains is temporary, and can be overwritten at any time.
   */
  buffer: ClientBuffer;
  /**
   * A cache of arbitrary data, shared between all of the handlers.
   */
  sharedCache: Map<unknown, unknown> = new Map();
  /**
   * Debug rendering mode.
   *
   * How it affects the rendering ultimately depends on the handlers.
   */
  debugRenderMode = DebugRenderMode.None;

  directLoadId = 0;

  constructor(canvas: HTMLCanvasElement, options?: WebGLContextAttributes) {
    super();

    const webgl = new WebGL(canvas, options);
    const gl = webgl.gl;

    this.canvas = canvas;
    this.gl = gl;
    this.webgl = webgl;
    this.buffer = webgl.createClientBuffer();

    // The only initial setup, the rest should be handled by the handlers.
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.SCISSOR_TEST);
  }

  /**
   * Enable audio if AudioContext is available.
   */
  enableAudio(): boolean {
    if (typeof AudioContext === "function") {
      this.audioEnabled = true;

      return true;
    }

    return false;
  }

  /**
   * Add an handler.
   */
  addHandler(handler: Handler, ...args: unknown[]): boolean {
    if (handler) {
      const handlers = this.handlers;

      // Check to see if this handler was added already.
      if (!handlers.has(handler)) {
        if (!handler.isValidSource) {
          this.emit("error", {
            viewer: this,
            error: "Handler missing the isValidSource function",
            handler,
          });
          return false;
        }

        // Check if the handler has a loader, and if so load it.
        if (handler.load) {
          try {
            handler.load(this, ...args);
          } catch (e) {
            this.emit("error", {
              viewer: this,
              error: `Handler failed to load`,
              handler,
              reason: e,
            });

            return false;
          }
        }

        handlers.add(handler);

        return true;
      }
    }

    return false;
  }

  /**
   * Add a scene.
   */
  addScene(): Scene {
    const scene = new Scene(this);

    this.scenes.push(scene);

    return scene;
  }

  /**
   * Remove a scene.
   */
  removeScene(scene: Scene): boolean {
    const scenes = this.scenes;
    const index = scenes.indexOf(scene);

    if (index !== -1) {
      scenes.splice(index, 1);

      return true;
    }

    return false;
  }

  /**
   * Removes all of the scenes in the viewer.
   */
  clear(): void {
    this.scenes.length = 0;
  }

  /**
   * Given a source and an optional path solver, loads a resource and returns a promise to it.
   */
  async load(
    src: unknown,
    pathSolver?: PathSolver,
    solverParams?: SolverParams
  ): Promise<Resource | undefined> {
    let finalSrc: unknown;
    let fetchUrl = "";
    let promise;

    // Run the path solver if there is one.
    if (pathSolver) {
      try {
        finalSrc = pathSolver(src, solverParams);
      } catch (e) {
        this.emit("error", {
          viewer: this,
          error: `Path solver failed`,
          src,
          reason: e,
          pathSolver,
          solverParams,
        });

        return;
      }
    } else {
      finalSrc = src;
    }

    if (!finalSrc) {
      return;
    }

    // Allow path solvers to return promises.
    if (finalSrc instanceof Promise) {
      finalSrc = await finalSrc;
    }

    // Give path solvers the option to inject resources.
    if (finalSrc instanceof Resource) {
      return finalSrc;
    }

    // If the final source is a string, and doesn't match any handler, it is assumed to be an URL to fetch.
    if (typeof finalSrc === "string" && !this.detectFormat(finalSrc)) {
      fetchUrl = finalSrc;

      // Check the promise cache and return a promise if one exists.
      promise = this.promiseMap.get(fetchUrl);
      if (promise) {
        return promise;
      }

      // Check the fetch cache and return a resource if one exists.
      const resource = this.resourceMap.get(fetchUrl);
      if (resource) {
        return resource;
      }

      // Otherwise promise to fetch the data and construct a resource.
      promise = fetchDataType(fetchUrl, "arrayBuffer").then((value) => {
        if (value.ok) {
          return value.data;
        } else {
          this.emit("error", {
            viewer: this,
            error: `Failed to fetch a resource: ${value.error}`,
            fetchUrl,
            reason: value.data,
          });
          return;
        }
      });
    } else {
      fetchUrl = `__DIRECT_LOAD_${this.directLoadId++}`;
      promise = Promise.resolve(finalSrc);
    }

    promise = promise
      .then(async (actualSrc: any) => {
        // finalSrc will be undefined if this is a fetch and the fetch failed.
        if (actualSrc) {
          if (
            Object.prototype.toString.call(actualSrc) ===
              "[object ArrayBuffer]" ||
            actualSrc instanceof ArrayBuffer
          ) {
            actualSrc = new Uint8Array(actualSrc as ArrayBuffer);
          }

          // If the source is an image source, load it directly.
          if (isImageSource(actualSrc)) {
            return new ImageTexture(<TexImageSource>actualSrc, {
              viewer: this,
              fetchUrl,
              pathSolver,
            });
          }

          // If the source is a buffer of an image, convert it to an image, and load it directly.
          if (
            actualSrc instanceof Uint8Array ||
            Object.prototype.toString.call(actualSrc) === "[object Uint8Array]"
          ) {
            const type = detectMime(actualSrc as Uint8Array);

            if (type.length) {
              return new ImageTexture(
                await blobToImage(new Blob([actualSrc.buffer], { type })),
                { viewer: this, fetchUrl, pathSolver }
              );
            }
          }

          // Attempt to match the source to a handler.
          const handler = this.detectFormat(actualSrc);
          if (handler) {
            try {
              const resource = new handler.resource(actualSrc, {
                viewer: this,
                fetchUrl,
                pathSolver,
              });

              // If the resource is blocked by internal resources being loaded, wait for them and then clear them.
              await Promise.all(resource.blockers);
              resource.blockers.length = 0;

              return resource;
            } catch (e) {
              this.emit("error", {
                viewer: this,
                error: "Failed to create a resource",
                fetchUrl,
                src,
                reason: e,
              });
            }
          } else {
            this.emit("error", {
              viewer: this,
              error: "Source has no matching handler",
              fetchUrl,
              src,
            });
          }
        }

        return;
      })
      .then((resource) => {
        this.promiseMap.delete(fetchUrl);

        if (resource) {
          this.resourceMap.set(fetchUrl, resource);
          this.resources.push(resource);

          this.emit("load", { viewer: this, fetchUrl, resource });
        }

        this.emit("loadend", { viewer: this, fetchUrl, resource });
        this.checkLoadingStatus();

        return resource;
      });

    this.promiseMap.set(fetchUrl, promise);
    this.emit("loadstart", { viewer: this, fetchUrl, promise });

    return promise;
  }

  detectFormat(src: unknown): Handler | undefined {
    for (const handler of this.handlers) {
      if (handler.isValidSource(src)) {
        return handler;
      }
    }

    return;
  }

  /**
   * Check whether the given string maps to a resource in the cache.
   */
  has(key: string): boolean {
    return this.resourceMap.has(key);
  }

  /**
   * Get a resource from the cache.
   */
  get(key: string): Resource | undefined {
    return this.resourceMap.get(key);
  }

  /**
   * Load something generic.
   *
   * Unlike load(), this does not use handlers or construct any internal objects.
   *
   * `dataType` can be one of: `"image"`, `"string"`, `"arrayBuffer"`, `"bytes"`, `"blob"`.
   *
   * If `callback` isn't given, the resource's `data` is the fetch data, according to `dataType`.
   *
   * If `callback` is given, the resource's `data` is the value returned by it when called with the fetch data.
   *
   * If `callback` returns a promise, the resource's `data` will be whatever the promise resolved to.
   */
  async loadGeneric(
    fetchUrl: string,
    dataType: FetchDataTypeName,
    callback?: (data: FetchDataType) => unknown
  ): Promise<GenericResource | undefined> {
    // Check the promise cache and return a promise if one exists.
    const promise = this.promiseMap.get(fetchUrl);
    if (promise) {
      return <Promise<GenericResource>>promise;
    }

    // Check the fetch cache and return a resource if one exists.
    const resource = this.resourceMap.get(fetchUrl);
    if (resource) {
      return <GenericResource>resource;
    }

    const fetchPromise = fetchDataType(fetchUrl, dataType).then(
      async (value: FetchResult) => {
        // Once the resource finished loading (successfully or not), the promise can be removed from the promise cache.
        this.promiseMap.delete(fetchUrl);

        let resource;

        if (value.ok) {
          let data: unknown = value.data;

          if (callback) {
            data = await callback(<FetchDataType>data);
          }

          resource = new GenericResource(data, { viewer: this, fetchUrl });

          this.resourceMap.set(fetchUrl, resource);
          this.resources.push(resource);

          this.emit("load", { viewer: this, fetchUrl, resource });
        } else {
          this.emit("error", {
            viewer: this,
            error: "Failed to fetch a generic resource",
            fetchUrl,
          });
        }

        this.emit("loadend", { viewer: this, fetchUrl, resource });
        this.checkLoadingStatus();

        return resource;
      }
    );

    this.promiseMap.set(fetchUrl, fetchPromise);
    this.emit("loadstart", { viewer: this, fetchUrl });

    return fetchPromise;
  }

  /**
   * Unload a resource.
   * Note that this only removes the resource from the viewer's cache.
   * If it's being referenced and used e.g. by a scene, it will not be garbage collected.
   */
  unload(resource: Resource): boolean {
    const fetchUrl = resource.fetchUrl;

    if (fetchUrl !== "") {
      this.resourceMap.delete(fetchUrl);
    }

    const resources = this.resources;
    const index = resources.indexOf(resource);

    if (index !== -1) {
      resources.splice(index, 1);

      return true;
    }

    return false;
  }

  /**
   * Starts loading a new empty resource, and returns it.
   * This empty resource will block the "idle" event (and thus whenAllLoaded) until it's resolved.
   * This is used when a resource might get loaded in the future, but it is not known what it is yet.
   */
  promise(): () => void {
    const promise = Promise.resolve(undefined);
    const key = `${performance.now()}`;

    this.promiseMap.set(key, promise);

    return (): void => {
      this.promiseMap.delete(key);
      this.checkLoadingStatus();
    };
  }

  checkLoadingStatus(): void {
    if (this.promiseMap.size === 0) {
      // A timeout is used so that this event will arrive after the current frame to let everything settle.
      setTimeout(() => this.emit("idle"), 0);
    }
  }

  /**
   * Wait for all of the resources to load.
   *
   * If a callback is given, it will be called, otherwise, a promise is returned.
   */
  whenAllLoaded(): Promise<ModelViewer>;
  whenAllLoaded(callback: (viewer: ModelViewer) => void): void;
  whenAllLoaded(
    callback?: (viewer: ModelViewer) => void
  ): Promise<ModelViewer> | void {
    const promise = new Promise((resolve: (viewer: ModelViewer) => void) => {
      if (this.promiseMap.size === 0) {
        resolve(this);
      } else {
        this.once("idle", () => resolve(this));
      }
    });

    if (callback) {
      promise.then(() => callback(this));
    } else {
      return promise;
    }
  }

  /**
   * Get a blob representing the contents of the viewer's canvas.
   *
   * If a callback is given, it will be called, otherwise, a promise is returned.
   */
  toBlob(): Promise<Blob>;
  toBlob(callback: BlobCallback): void;
  toBlob(callback?: BlobCallback): Promise<Blob | null> | void {
    const promise = new Promise((resolve: BlobCallback) =>
      this.canvas.toBlob((blob) => resolve(blob))
    );

    if (callback) {
      promise.then((blob) => callback(blob));
    } else {
      return promise;
    }
  }

  /**
   * Update and render a frame.
   */
  updateAndRender(dt = 1000 / 60): void {
    this.update(dt);
    this.startFrame();
    this.render();
  }

  /**
   * Update all of the scenes, which includes updating their cameras, audio context if one exists, and all of the instances they hold.
   */
  update(dt = 1000 / 60): void {
    // Animations are in milliseconds, while particle movement and such is in seconds.
    // It's easier to pass the time in seconds here, and turn it back to milliseconds for each instance, than it is to do the opposite for each particle.
    dt *= 0.001;

    this.frame += 1;

    this.visibleCells = 0;
    this.visibleInstances = 0;
    this.updatedParticles = 0;

    for (const scene of this.scenes) {
      scene.update(dt);

      this.visibleCells += scene.visibleCells;
      this.visibleInstances += scene.visibleInstances;
      this.updatedParticles += scene.updatedParticles;
    }
  }

  /**
   * Clears the WebGL buffer.
   *
   * Called automatically by updateAndRender().
   *
   * Call this at some point before render() if you need more control.
   */
  startFrame(): void {
    const gl = this.gl;

    // See https://www.opengl.org/wiki/FAQ#Masking
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  /**
   * Render.
   */
  render(): void {
    for (const scene of this.scenes) {
      scene.render();
    }
  }

  /**
   * Clear all of the emitted objects in this viewer.
   */
  clearEmittedObjects(): void {
    for (const scene of this.scenes) {
      scene.clearEmittedObjects();
    }
  }
}
