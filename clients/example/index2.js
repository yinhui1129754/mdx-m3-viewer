
import * as ModelViewer from '../../src/';
import { setupCamera } from '../shared/camera';
const handlers = ModelViewer.viewer.handlers;

let canvas = document.getElementById('canvas');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
window.onresize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
};
// Create the viewer!
let viewer = new ModelViewer.viewer.ModelViewer(canvas);

// Create a new scene. Each scene has its own camera, and a list of things to render.
let scene = viewer.addScene();

// Check camera.js!
setupCamera(scene);

// Events.
viewer.on('loadstart', (e) => console.log(e));
viewer.on('load', (e) => console.log('load', e));
viewer.on('loadend', (e) => console.log('loadend', e));
viewer.on('error', (e) => console.log('error', e));

// Add the MDX handler.
// Note that this also loads all of the team colors/glows.
// You can optionally supply a path solver (look below) to point the viewer to the right location of the textures.
// Additionally, a boolean can be given that selects between RoC/TFT and Reforged team colors.
// For example:
//   viewer.addHandler(handlers.mdx, pathSolver); // Roc/TFT = 14 teams.
//   viewer.addHandler(handlers.mdx, pathSolver, true); // Reforged = 28 teams.
// In the case of this example, team colors aren't used, so it's fine for their loads to simply fail.
viewer.addHandler(handlers.mdx, (src) => 'resources/' + src);

// Add the BLP handler.
viewer.addHandler(handlers.blp);
// Add the BLP handler.
viewer.addHandler(handlers.tga);
viewer.addHandler(handlers.dds);

// A path solver is used for every load call.
// Given a possibly relative source, it should return the actual source to load from.
// This can be in the form of an URL string, or direct sources from memory (e.g. a previously loaded ArrayBuffer).
// function pathSolver(src) {
//   console.log(src)
//   return 'resources/' + src;
// }

// Load our MDX model!
// let modelPromise = viewer.load('[zs]ashentree4s.mdx', pathSolver);

// modelPromise.then((model) => {
//   // The promise can return undefined if something went wrong!
//   if (model) {
//     // Create an instance of this model.
//     let instance = model.addInstance();

//     // Set the instance's scene.
//     // Equivalent to scene.addInstance(instance)
//     instance.setScene(scene);

//     // Want to run the second animation.
//     // 0 is the first animation, and -1 is no animation.
//     instance.setSequence(1);

//     // Tell the instance to loop animations forever.
//     // This overrides the setting in the model itself.
//     instance.setSequenceLoopMode(2);

//     // Let's create another instance and do other stuff with it.
//     let instance2 = model.addInstance();
//     instance2.setScene(scene);
//     instance2.setSequence(0);
//     instance2.setSequenceLoopMode(2);
//     instance2.move([100, 100, 0]);
//     instance2.uniformScale(0.5);

//     // And a third one.
//     let instance3 = model.addInstance();
//     instance3.setScene(scene);
//     instance3.setSequence(2);
//     instance3.setSequenceLoopMode(2);
//     instance3.move([-100, -100, 0]);
//   }
// });

// The viewer has the update(), startFrame(), render(), and updateAndRender() functions.
// Generally speaking, you will want a simple never ending loop like the one that follows, but who knows. The control is in your hands.
(function step() {
    requestAnimationFrame(step);

    viewer.updateAndRender();
})();

window.viewer = viewer;
window.scene = scene;
// 阻止浏览器默认拖放行为
(['dragenter', 'dragover', 'dragleave', 'drop']).forEach(eventName => {
    window.addEventListener(eventName, e => {
        e.preventDefault();
        e.stopPropagation();
    }, false);
});

// 拖入时添加视觉反馈
window.addEventListener('dragenter', () => {
    document.body.classList.add('active');
}, false);

// 拖出时移除视觉反馈
window.addEventListener('dragleave', () => {
    document.body.classList.remove('active');
}, false);

// 处理文件放下事件
window.addEventListener('drop', e => {
    document.body.classList.remove('active');

    // 获取拖放的文件
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        readFileAsBuffer(file);
    }
}, false);
// 读取文件为ArrayBuffer
function readFileAsBuffer(file) {
    const reader = new FileReader();

    reader.onload = () => {
        const buffer = reader.result;
        var modelPromise = viewer.load(buffer, (a) => {
            return a;
        });
        modelPromise.then((model) => {
            // The promise can return undefined if something went wrong!
            if (model) {
                scene.clear()
                // Create an instance of this model.
                let instance = model.addInstance();
                // Set the instance's scene.
                // Equivalent to scene.addInstance(instance)
                instance.setScene(scene);

                // Want to run the second animation.
                // 0 is the first animation, and -1 is no animation.
                instance.setSequence(1);

                // Tell the instance to loop animations forever.
                // This overrides the setting in the model itself.
                instance.setSequenceLoopMode(2);

                // // Let's create another instance and do other stuff with it.
                // let instance2 = model.addInstance();
                // instance2.setScene(scene);
                // instance2.setSequence(0);
                // instance2.setSequenceLoopMode(2);
                // instance2.move([100, 100, 0]);
                // instance2.uniformScale(0.5);

                // // And a third one.
                // let instance3 = model.addInstance();
                // instance3.setScene(scene);
                // instance3.setSequence(2);
                // instance3.setSequenceLoopMode(2);
                // instance3.move([-100, -100, 0]);
            }
        });
        // 这里可以添加对buffer的处理逻辑
        // 例如转换为Uint8Array: const uint8 = new Uint8Array(buffer);
    };

    reader.onerror = () => {
        console.error('文件读取失败:', reader.error);
    };

    // 读取为ArrayBuffer
    reader.readAsArrayBuffer(file);
}