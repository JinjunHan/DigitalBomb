// A fresh browser profile opens the learning hub before the lobby accepts input.
module.exports = async function enterTestLobby(page, { disconnect = false } = {}) {
  await page.waitForFunction(() => {
    const canvas = window.cc?.director.getScene()?.getChildByName('Canvas');
    return canvas?.components.some(app => app.startupEntered && app.learning?.ready && app.learning.visible);
  });
  const point = await page.waitForFunction(() => {
    const canvas = cc.director.getScene().getChildByName('Canvas');
    const app = canvas.components.find(component => component.learning);
    function findButton(node) {
      if (!node.activeInHierarchy) return;
      if (node.name === 'LearningControl-先去大厅' || node.getComponent(cc.Label)?.string === '先去大厅') return node;
      for (const child of node.children) {
        const match = findButton(child);
        if (match) return match;
      }
    }
    const button = findButton(app.node);
    if (!button) return null;
    const p = button.worldPosition;
    const size = cc.view.getVisibleSize();
    const rect = document.querySelector('canvas').getBoundingClientRect();
    return { x: rect.left + p.x / size.width * rect.width, y: rect.bottom - p.y / size.height * rect.height };
  });
  const { x, y } = await point.jsonValue();
  await page.mouse.click(x, y);
  await page.waitForFunction(() => cc.director.getScene().getChildByName('Canvas').components.some(app => app.learning && !app.learning.visible));
  if (disconnect) {
    await page.evaluate(() => {
      const app = cc.director.getScene().getChildByName('Canvas').components.find(component => component.net);
      app.net.onState = () => {};
      app.net.onStatus = () => {};
      app.net.stop();
    });
    await page.waitForFunction(() => cc.director.getScene().getChildByName('Canvas').components.some(app => app.net && !app.net.online));
  }
};
