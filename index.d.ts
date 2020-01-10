export default class TextExpanderElement extends HTMLElement {
  keys: any;
}

declare global {
  interface Window {
    TextExpanderElement: typeof TextExpanderElement
  }
}
