
import * as ModelViewer from '../../src/';
import { setupCamera } from '../shared/camera';
const handlers = ModelViewer.viewer.handlers;
class UseRenderObject {

  pageInfo = {
    page: -1, // 当前页
    pageSize: 5, // 每页显示数量
    total: -1,// 总数量
    allPages: 0 // 总页数
  }
  items = []
  constructor(el) {
    this.parentNode = el
  }

  /**
   * [item...]
   * @param {*} nameArrs 
   */
  showList(nameArrs) {
    console.log(nameArrs)
  }

  getItem(name) {
    return this.items.find(item => item.item.name === name)
  }
  /**
   * {
   *  path:string //完整路径
   *  name:string //文件名
   *  ext:string //文件扩展名
   *  showName:string //显示名称
   * }
   * @param {*} item 
   */
  showItem(item) {
    var domItem = {
      itemNode: document.createElement("div"),
      canvasBox: document.createElement("div"),
      desBox: document.createElement("div"),
      hContent: document.createElement("h3"),
      pContent: document.createElement("p"),
      item: item
    }

    domItem.itemNode.setAttribute("class", "card")
    domItem.canvasBox.setAttribute("class", "card-view")
    domItem.desBox.setAttribute("class", "card-desc")
    domItem.itemNode.appendChild(domItem.canvasBox);
    domItem.itemNode.appendChild(domItem.desBox);
    domItem.desBox.appendChild(domItem.hContent);
    domItem.desBox.appendChild(domItem.pContent);
    var canvas = document.createElement("canvas");

    canvas.width = 250
    canvas.height = 180
    domItem.canvasBox.appendChild(canvas);
    domItem.canvas = canvas
    // Create the viewer!
    let viewer = new ModelViewer.viewer.ModelViewer(canvas);

    domItem.viewer = viewer;
    let scene = viewer.addScene();
    setupCamera(scene);
    domItem.scene = scene;
    viewer.on('loadstart', (e) => console.log(e));
    viewer.on('load', (e) => console.log('load', e));
    viewer.on('loadend', (e) => console.log('loadend', e));
    viewer.on('error', (e) => console.log('error', e));
    viewer.addHandler(handlers.mdx, (src) => 'resources/' + src);

    // Add the BLP handler.
    viewer.addHandler(handlers.blp);
    // Add the BLP handler.
    viewer.addHandler(handlers.tga);
    viewer.addHandler(handlers.dds);
    this.items.push(domItem)
    domItem.showModel = false;
    this.parentNode.appendChild(domItem.itemNode)
    return domItem;
  }

  updateAndRender() {
    // 渲染逻辑

    for (var i = 0; i < this.items.length; i++) {
      var domItem = this.items[i]
      if (!domItem.showModel) continue;
      if (domItem.viewer) {

        domItem.viewer.updateAndRender()
      }
    }
  }

  getPageDom() {
    var pageDom = document.getElementById("pageCont");
    var nextDom = document.getElementById("nextPage");
    var prevDom = document.getElementById("prevPage");
    var showNowPage = document.getElementById("showNowPage");
    var changePageSize = document.getElementById("changePageSize");
    var allPage = document.getElementById("allPage");
    return {
      pageDom,
      nextDom,
      prevDom,
      showNowPage,
      changePageSize,
      allPage
    }
  }

  updatePageView() {
    var pageDom = this.getPageDom()
    pageDom.showNowPage.value = `${(this.pageInfo.page + 1)}`
    pageDom.allPage.innerHTML = `${this.pageInfo.allPages}`
    pageDom.changePageSize.value = `${this.pageInfo.pageSize}`
  }
  resetViewModelShow() {
    for (var i = 0; i < this.items.length; i++) {
      this.items[i].showModel = false;
    }
  }
  addPageEvent() {
    var pageDom = this.getPageDom()
    pageDom.nextDom.addEventListener('click', () => {
      if (this.pageInfo.allPages > 0) {

        var beforePage = this.pageInfo.page;
        this.pageInfo.page += 1;
        if (this.pageInfo.page >= this.pageInfo.allPages) {
          this.pageInfo.page = this.pageInfo.allPages - 1
        }
        if (beforePage !== this.pageInfo.page) {
          this.updatePageView()
          this.resetViewModelShow()
          window.top.ifc.showPage(this.pageInfo)
        }
      }
    });
    pageDom.prevDom.addEventListener('click', () => {

      if (this.pageInfo.allPages > 0) {
        var beforePage = this.pageInfo.page;
        this.pageInfo.page -= 1;
        if (this.pageInfo.page < 0) {
          this.pageInfo.page = 0
        }
        if (beforePage !== this.pageInfo.page) {

          this.updatePageView()
          this.resetViewModelShow()
          window.top.ifc.showPage(this.pageInfo)
        }
      }
    })
    pageDom.showNowPage.addEventListener("change", () => {
      var beforePage = this.pageInfo.page;
      this.pageInfo.page = pageDom.showNowPage.value - 1;
      if (this.pageInfo.page < 0) {
        this.pageInfo.page = 0
      }
      if (this.pageInfo.page >= this.pageInfo.allPages) {
        this.pageInfo.page = this.pageInfo.allPages - 1
      }
      if (beforePage !== this.pageInfo.page) {

        this.updatePageView()
        this.resetViewModelShow()
        window.top.ifc.showPage(this.pageInfo)
      }
    })
    // pageDom.changePageSize.addEventListener("change",()=>{
    //   this.pageInfo.pageSize = parseInt(pageDom.changePageSize.value);

    // })
  }
  // 分页
  setPageTotal(t) {
    this.pageInfo.total = t;
    this.pageInfo.allPages = Math.ceil(t / this.pageInfo.pageSize);
    this.pageInfo.page = 0;

    this.updatePageView()
    if (window.top.ifc) {
      window.top.ifc.showPage(this.pageInfo)
    }
  }
}


var renderObject = new UseRenderObject(document.getElementById('view-content'));

window.renderObject = renderObject;
renderObject.addPageEvent();
(function step() {
  requestAnimationFrame(step);

  renderObject.updateAndRender();
})();

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
  return;
  // document.body.classList.remove('active');

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