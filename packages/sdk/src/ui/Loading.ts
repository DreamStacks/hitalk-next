/**
 * Loading 加载组件
 */

export class Loading {
  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
    this.render()
  }

  private render() {
    this.container.innerHTML = `
      <div class="vloading dn">
        <div class="spinner">
          <div class="r1"></div>
          <div class="r2"></div>
          <div class="r3"></div>
          <div class="r4"></div>
          <div class="r5"></div>
        </div>
      </div>
    `
  }

  show() {
    const loading = this.container.querySelector('.vloading')
    loading?.classList.remove('dn')
  }

  hide() {
    const loading = this.container.querySelector('.vloading')
    loading?.classList.add('dn')
  }
}
