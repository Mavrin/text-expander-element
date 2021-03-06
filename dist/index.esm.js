import { install, clearSelection, navigate, uninstall } from '@github/combobox-nav';

const boundary = /\s|\(|\[/; // Extracts a keyword from the source text, backtracking from the cursor position.

function keyword(text, key, cursor) {
  // Activation key not found in front of the cursor.
  const keyIndex = text.lastIndexOf(key, cursor - 1);
  if (keyIndex === -1) return; // Space between the cursor and previous activation key.

  const spaceIndex = text.lastIndexOf(' ', cursor - 1);
  if (spaceIndex > keyIndex) return; // Activation key must occur at word boundary.

  const pre = text[keyIndex - 1];
  if (pre && !boundary.test(pre)) return; // Extract matched keyword.

  const word = text.substring(keyIndex + key.length, cursor);
  return {
    word,
    position: keyIndex + key.length
  };
}

const properties = ['position:absolute;', 'overflow:auto;', 'word-wrap:break-word;', 'top:0px;', 'left:-9999px;']; // Copy CSS properties from text field to div that would affect the cursor position.

const propertyNamesToCopy = ['box-sizing', 'font-family', 'font-size', 'font-style', 'font-variant', 'font-weight', 'height', 'letter-spacing', 'line-height', 'max-height', 'min-height', 'padding-bottom', 'padding-left', 'padding-right', 'padding-top', 'border-bottom', 'border-left', 'border-right', 'border-top', 'text-decoration', 'text-indent', 'text-transform', 'width', 'word-spacing']; // Map from text field element to its mirror.

const mirrorMap = new WeakMap(); // Builds offscreen div that mirrors the text field.
//
// textField - A HTMLInputElement or HTMLTextAreaElement element
// markerPosition - Optional Number to position a cursor marker at
//                  (defaults to the end of the text)
//
// Returns an Element attached to the DOM. It is the callers
// responsibility to cleanup and remove the element after they are
// finished with their measurements.

function textFieldMirror(textField, markerPosition) {
  const nodeName = textField.nodeName.toLowerCase();

  if (nodeName !== 'textarea' && nodeName !== 'input') {
    throw new Error('expected textField to a textarea or input');
  }

  let mirror = mirrorMap.get(textField);

  if (mirror && mirror.parentElement === textField.parentElement) {
    mirror.innerHTML = '';
  } else {
    mirror = document.createElement('div');
    mirrorMap.set(textField, mirror);
    const style = window.getComputedStyle(textField);
    const props = properties.slice(0);

    if (nodeName === 'textarea') {
      props.push('white-space:pre-wrap;');
    } else {
      props.push('white-space:nowrap;');
    }

    for (let i = 0, len = propertyNamesToCopy.length; i < len; i++) {
      const name = propertyNamesToCopy[i];
      props.push("".concat(name, ":").concat(style.getPropertyValue(name), ";"));
    }

    mirror.style.cssText = props.join(' ');
  }

  const marker = document.createElement('span');
  marker.style.cssText = 'position: absolute;';
  marker.innerHTML = '&nbsp;';
  let before;
  let after;

  if (typeof markerPosition === 'number') {
    let text = textField.value.substring(0, markerPosition);

    if (text) {
      before = document.createTextNode(text);
    }

    text = textField.value.substring(markerPosition);

    if (text) {
      after = document.createTextNode(text);
    }
  } else {
    const text = textField.value;

    if (text) {
      before = document.createTextNode(text);
    }
  }

  if (before) {
    mirror.appendChild(before);
  }

  mirror.appendChild(marker);

  if (after) {
    mirror.appendChild(after);
  }

  if (!mirror.parentElement) {
    if (!textField.parentElement) {
      throw new Error('textField must have a parentElement to mirror');
    }

    textField.parentElement.insertBefore(mirror, textField);
  }

  mirror.scrollTop = textField.scrollTop;
  mirror.scrollLeft = textField.scrollLeft;
  return {
    mirror,
    marker
  };
}

// number of pixels from the top left of the `textField`. Useful for
// positioning a popup near the insertion point.
//
// const {top, left} = textFieldSelectionPosition(textarea)
//
// Measures offset position of cursor in text field.
//
// field - A HTMLTextAreaElement or HTMLInputElement
// index - Number index into textField.value (default: textField.selectionEnd)
//
// Returns object with {top, left} properties.

function textFieldSelectionPosition(field) {
  let index = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : field.selectionEnd;
  const {
    mirror,
    marker
  } = textFieldMirror(field, index);
  const mirrorRect = mirror.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  setTimeout(() => {
    mirror.remove();
  }, 5000);
  return {
    top: markerRect.top - mirrorRect.top,
    left: markerRect.left - mirrorRect.left
  };
}

const states = new WeakMap();

class TextExpander {
  constructor(expander, input) {
    this.expander = expander;
    this.input = input;
    this.menu = null;
    this.oninput = this.onInput.bind(this);
    this.onpaste = this.onPaste.bind(this);
    this.onkeydown = this.onKeydown.bind(this);
    this.oncommit = this.onCommit.bind(this);
    this.onmousedown = this.onMousedown.bind(this);
    this.onblur = this.onBlur.bind(this);
    this.interactingWithList = false;
    input.addEventListener('paste', this.onpaste);
    input.addEventListener('input', this.oninput);
    input.addEventListener('keydown', this.onkeydown);
    input.addEventListener('blur', this.onblur);
  }

  destroy() {
    this.input.removeEventListener('paste', this.onpaste);
    this.input.removeEventListener('input', this.oninput);
    this.input.removeEventListener('keydown', this.onkeydown);
    this.input.removeEventListener('blur', this.onblur);
  }

  activate(match, menu) {
    if (this.input !== document.activeElement) return;
    this.deactivate();
    this.menu = menu;
    if (!menu.id) menu.id = "text-expander-".concat(Math.floor(Math.random() * 100000).toString());
    this.input.setAttribute('aria-owns', menu.id);
    this.expander.append(menu);
    const {
      top,
      left
    } = textFieldSelectionPosition(this.input, match.position);
    menu.style.top = "".concat(top, "px");
    menu.style.left = "".concat(left, "px");
    install(this.input, menu);
    menu.addEventListener('combobox-commit', this.oncommit);
    menu.addEventListener('mousedown', this.onmousedown); // Focus first menu item.

    clearSelection(this.input, menu);
    navigate(this.input, menu);
  }

  deactivate() {
    const menu = this.menu;
    if (!menu) return;
    this.menu = null;
    menu.removeEventListener('combobox-commit', this.oncommit);
    menu.removeEventListener('mousedown', this.onmousedown);
    uninstall(this.input, menu);
    this.input.removeAttribute('aria-owns');
    menu.remove();
  }

  onCommit(_ref) {
    let {
      target
    } = _ref;
    const item = target;
    if (!(item instanceof HTMLElement)) return;
    const match = this.match;
    if (!match) return;
    const beginning = this.input.value.substring(0, match.position - match.key.length);
    const remaining = this.input.value.substring(match.position + match.text.length);
    const detail = {
      item,
      key: match.key,
      value: null
    };
    const canceled = !this.expander.dispatchEvent(new CustomEvent('text-expander-value', {
      cancelable: true,
      detail
    }));
    if (canceled) return;
    if (!detail.value) return;
    const value = "".concat(detail.value, " ");
    this.input.value = beginning + value + remaining;
    this.deactivate();
    this.input.focus();
    const cursor = beginning.length + value.length;
    this.input.selectionStart = cursor;
    this.input.selectionEnd = cursor;
  }

  onBlur() {
    if (this.interactingWithList) {
      this.interactingWithList = false;
      return;
    }

    this.deactivate();
  }

  onPaste() {
    this.justPasted = true;
  }

  async onInput() {
    if (this.justPasted) {
      this.justPasted = false;
      return;
    }

    const match = this.findMatch();

    if (match) {
      this.match = match;
      const menu = await this.notifyProviders(match); // Text was cleared while waiting on async providers.

      if (!this.match) return;

      if (menu) {
        this.activate(match, menu);
      } else {
        this.deactivate();
      }
    } else {
      this.match = null;
      this.deactivate();
    }
  }

  findMatch() {
    const cursor = this.input.selectionEnd;
    const text = this.input.value;

    for (const key of this.expander.keys) {
      const found = keyword(text, key, cursor);

      if (found) {
        return {
          text: found.word,
          key,
          position: found.position
        };
      }
    }
  }

  async notifyProviders(match) {
    const providers = [];

    const provide = result => providers.push(result);

    const canceled = !this.expander.dispatchEvent(new CustomEvent('text-expander-change', {
      cancelable: true,
      detail: {
        provide,
        text: match.text,
        key: match.key
      }
    }));
    if (canceled) return;
    const all = await Promise.all(providers);
    const fragments = all.filter(x => x.matched).map(x => x.fragment);
    return fragments[0];
  }

  onMousedown() {
    this.interactingWithList = true;
  }

  onKeydown(event) {
    if (event.key !== 'Escape') return;
    this.deactivate();
    event.stopImmediatePropagation();
    event.preventDefault();
  }

}

class TextExpanderElement extends HTMLElement {
  get keys() {
    const keys = this.getAttribute('keys');
    return keys ? keys.split(' ') : [];
  }

  set keys(value) {
    this.setAttribute('keys', value);
  }

  connectedCallback() {
    const input = this.querySelector('input[type="text"], textarea');
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
    const state = new TextExpander(this, input);
    states.set(this, state);
  }

  disconnectedCallback() {
    const state = states.get(this);
    if (!state) return;
    state.destroy();
    states.delete(this);
  }

}

if (!window.customElements.get('text-expander')) {
  window.TextExpanderElement = TextExpanderElement;
  window.customElements.define('text-expander', TextExpanderElement);
}

export default TextExpanderElement;
