import * as Blockly from 'blockly';

// The icon remains visually 18px, while its field occupies one standard
// compact Blockly row. Blockly centres the field box in an input row; the
// field itself centres the image inside that box. This is independent of the
// surrounding workspace (canvas, Toolbox, or Block Search flyout).
const ICON_SIZE = 18;
const FIELD_HEIGHT = 24;
const IMAGE_TOP = (FIELD_HEIGHT - ICON_SIZE) / 2;

/**
 * Presentation-only leading icon with stable, renderer-owned layout.
 *
 * Do not position these icons by measuring a rendered block. FieldImage is a
 * normal Blockly field, so the renderer owns the group transform and applies
 * the same row layout in every WorkspaceSvg.
 */
export class HaLeadingIconField extends Blockly.FieldImage {
  constructor(src) {
    super(src, ICON_SIZE, ICON_SIZE, '');
    this.SERIALIZABLE = false;
  }

  updateSize_() {
    super.updateSize_();
    // FieldImage normally reports only its image height. Reserve a stable
    // field box so its 18px image can be centred without post-render DOM
    // measurements or workspace-specific adjustments.
    this.size_.height = FIELD_HEIGHT;
  }

  initView() {
    super.initView();
    this.imageElement?.setAttribute('y', String(IMAGE_TOP));
  }
}
