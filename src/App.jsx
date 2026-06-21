import {
  ArrowDownToolbarItem,
  ArrowLeftToolbarItem,
  ArrowRightToolbarItem,
  ArrowToolbarItem,
  ArrowUpToolbarItem,
  AssetToolbarItem,
  CheckBoxToolbarItem,
  CloudToolbarItem,
  DefaultToolbar,
  DefaultColorStyle,
  DiamondToolbarItem,
  DrawToolbarItem,
  EllipseToolbarItem,
  EraserToolbarItem,
  FrameToolbarItem,
  HandToolbarItem,
  HeartToolbarItem,
  HexagonToolbarItem,
  HighlightToolbarItem,
  LaserToolbarItem,
  LineToolbarItem,
  NoteToolbarItem,
  OvalToolbarItem,
  RectangleToolbarItem,
  RhombusToolbarItem,
  SelectToolbarItem,
  StateNode,
  StarToolbarItem,
  TextToolbarItem,
  Tldraw,
  TldrawUiMenuToolItem,
  TriangleToolbarItem,
  XBoxToolbarItem,
  createShapeId,
  onDragFromToolbarToCreateShape,
  startEditingShapeWithRichText,
  toRichText,
  useEditor,
  useValue
} from 'tldraw'
import { AllSelection } from '@tiptap/pm/state'
import 'tldraw/tldraw.css'
import { useCallback, useEffect, useState } from 'react'
import annotationToolIconRaw from './assets/tool-comment.svg?raw'

const CANVAS_ENDPOINT = '/api/canvas'
const CANVAS_EVENTS_ENDPOINT = '/api/canvas-events'
const SELECTION_ENDPOINT = '/api/selection'
const VIEW_STATE_ENDPOINT = '/api/view-state'
const SELECTION_STATE_ELEMENT_ID = 'codesign-selection-state'
const AI_IMAGE_TOOL_ID = 'ai-image'
const AI_IMAGE_HOLDER_LABEL = 'AI 图片'
const AI_IMAGE_HOLDER_DEFAULT_W = 320
const AI_IMAGE_HOLDER_DEFAULT_H = 220
const AI_IMAGE_HOLDER_SIZE_STORAGE_KEY = 'codesign.aiImageHolderSize'
const AI_IMAGE_HOLDER_PRESETS = [
  { id: 'xiaohongshu', label: '小红书 4:5', width: 1080, height: 1350 },
  { id: 'square', label: '方图 1:1', width: 1024, height: 1024 },
  { id: 'story', label: '竖版 9:16', width: 1080, height: 1920 },
  { id: 'video', label: '横版 16:9', width: 1280, height: 720 },
  { id: 'poster', label: '海报 3:4', width: 1200, height: 1600 },
  { id: 'banner', label: '横幅 3:1', width: 1500, height: 500 }
]
const AI_IMAGE_HOLDER_DEFAULT_SIZE = AI_IMAGE_HOLDER_PRESETS[0]
const ANNOTATION_TOOL_ID = 'codesign-annotation'
const ANNOTATION_TOOL_LABEL = '标注'
const ANNOTATION_DEFAULT_COLOR = 'red'
const ANNOTATION_MIN_LENGTH = 8
const ANNOTATION_BEND_RATIO = 0.12
const ANNOTATION_MIN_BEND = 16
const ANNOTATION_MAX_BEND = 48
const ANNOTATION_LABEL_POSITION = 0
const ANNOTATION_COMMENT_TEXT = '评论'
const ANNOTATION_COMMENT_NOTE_OFFSET_X = 28
const ANNOTATION_COMMENT_NOTE_OFFSET_Y = -28
const ANNOTATION_COMMENT_MARKER_SIZE = 18
const ANNOTATION_SELECT_TEXT_MAX_ATTEMPTS = 8
const ANNOTATION_SELECT_TEXT_SETTLE_ATTEMPTS = 4
const annotationToolIconSvg = annotationToolIconRaw.replaceAll('black', 'currentColor')
const annotationToolIcon = (
  <div
    className="codesign-annotation-tool-icon"
    dangerouslySetInnerHTML={{ __html: annotationToolIconSvg }}
  />
)

function isCanvasSnapshot(value) {
  return value && typeof value === 'object' && value.store && value.schema
}

function recordsAreEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function applyRemoteCanvasSnapshot(editor, snapshot, { preserveLocalChanges = false } = {}) {
  if (!isCanvasSnapshot(snapshot)) return 0

  const migratedSnapshot = editor.store.migrateSnapshot(snapshot)
  const recordsToPut = Object.values(migratedSnapshot.store).filter((record) => {
    const localRecord = editor.store.get(record.id)
    if (!localRecord) return true
    if (preserveLocalChanges) return false
    return !recordsAreEqual(localRecord, record)
  })

  if (recordsToPut.length === 0) return 0

  editor.store.mergeRemoteChanges(() => {
    editor.store.put(recordsToPut)
  })

  return recordsToPut.length
}

function getAiImageHolderMeta() {
  return {
    codesignAiImageHolder: true,
    codesignAiImageHolderVersion: 1
  }
}

function clampImageDimension(value, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(Math.round(number), 64), 4096)
}

function normalizeAiImageHolderSize(value) {
  const width = clampImageDimension(value?.width, AI_IMAGE_HOLDER_DEFAULT_W)
  const height = clampImageDimension(value?.height, AI_IMAGE_HOLDER_DEFAULT_H)
  const preset = AI_IMAGE_HOLDER_PRESETS.find((item) => item.id === value?.id)

  return {
    id: preset?.id ?? value?.id ?? 'custom',
    label: preset?.label ?? value?.label ?? '自定义',
    width,
    height
  }
}

function readStoredAiImageHolderSize() {
  try {
    const storedValue = window.localStorage.getItem(AI_IMAGE_HOLDER_SIZE_STORAGE_KEY)
    if (!storedValue) return AI_IMAGE_HOLDER_DEFAULT_SIZE
    return normalizeAiImageHolderSize(JSON.parse(storedValue))
  } catch {
    return AI_IMAGE_HOLDER_DEFAULT_SIZE
  }
}

let currentAiImageHolderSize = AI_IMAGE_HOLDER_DEFAULT_SIZE

function getCurrentAiImageHolderSize() {
  if (typeof window !== 'undefined') {
    currentAiImageHolderSize = normalizeAiImageHolderSize(
      currentAiImageHolderSize?.id ? currentAiImageHolderSize : readStoredAiImageHolderSize()
    )
  }

  return currentAiImageHolderSize
}

function setCurrentAiImageHolderSize(size) {
  currentAiImageHolderSize = normalizeAiImageHolderSize(size)

  try {
    window.localStorage.setItem(
      AI_IMAGE_HOLDER_SIZE_STORAGE_KEY,
      JSON.stringify(currentAiImageHolderSize)
    )
  } catch {
    // Local storage is only a convenience for the toolbar default.
  }

  return currentAiImageHolderSize
}

function formatAiImageHolderSize(size) {
  return `${size.width}×${size.height}`
}

function createAiImageHolderShape(editor, id, shapeOverrides = {}) {
  const { meta, props, size, ...shapeRecordOverrides } = shapeOverrides
  const { scale: _scale, ...frameProps } = props ?? {}
  const holderSize = normalizeAiImageHolderSize(size ?? getCurrentAiImageHolderSize())
  const width = frameProps.w ?? holderSize.width
  const height = frameProps.h ?? holderSize.height

  return editor.createShape({
    ...shapeRecordOverrides,
    id,
    type: 'frame',
    meta: {
      ...getAiImageHolderMeta(),
      codesignAiImageHolderSize: {
        presetId: holderSize.id,
        label: holderSize.label,
        width,
        height
      },
      ...meta
    },
    props: {
      w: width,
      h: height,
      name: `${AI_IMAGE_HOLDER_LABEL} · ${holderSize.label} · ${formatAiImageHolderSize({ width, height })}`,
      color: 'blue',
      ...frameProps
    }
  })
}

function createAiImageHolderAtViewportCenter(editor) {
  const holderSize = getCurrentAiImageHolderSize()
  const w = holderSize.width
  const h = holderSize.height
  const center = editor.getViewportPageBounds().center
  const id = createShapeId()

  createAiImageHolderShape(editor, id, {
    x: center.x - w / 2,
    y: center.y - h / 2,
    size: holderSize,
    props: { w, h }
  })
  editor.select(id)
  editor.setCurrentTool('select.idle')
}

function startEditingAnnotationArrowLabel(editor, arrowId) {
  const shape = editor.getShape(arrowId)
  if (!shape || !editor.canEditShape(shape)) {
    return
  }

  editor.select(arrowId)
  startEditingShapeWithRichText(editor, arrowId, { selectAll: true })
  pinAnnotationArrowLabelPosition(editor, arrowId)
  editor.getCurrentTool().setCurrentToolIdMask(ANNOTATION_TOOL_ID)
  selectAnnotationTextWhenReady(editor, arrowId)
}

function startEditingAnnotationComment(editor, noteId) {
  const shape = editor.getShape(noteId)
  if (!shape || !editor.canEditShape(shape)) {
    return
  }

  editor.select(noteId)
  startEditingShapeWithRichText(editor, noteId, { selectAll: true })
  editor.getCurrentTool().setCurrentToolIdMask(ANNOTATION_TOOL_ID)
  selectAnnotationTextWhenReady(editor, noteId)
}

function createAnnotationCommentAtPoint(editor, point) {
  const scale = editor.getResizeScaleFactor()
  const color = getAnnotationColor(editor)
  const markerSize = ANNOTATION_COMMENT_MARKER_SIZE * scale
  const markerId = createShapeId()
  const noteId = createShapeId()

  editor.createShapes([
    {
      id: markerId,
      type: 'geo',
      x: point.x - markerSize / 2,
      y: point.y - markerSize / 2,
      meta: {
        codesignAnnotationComment: true,
        codesignAnnotationCommentRole: 'marker',
        codesignAnnotationCommentNoteId: noteId
      },
      props: {
        w: markerSize,
        h: markerSize,
        geo: 'ellipse',
        dash: 'solid',
        growY: 0,
        url: '',
        scale: 1,
        color,
        labelColor: color,
        fill: 'solid',
        size: 's',
        font: 'draw',
        align: 'middle',
        verticalAlign: 'middle',
        richText: toRichText('')
      }
    },
    {
      id: noteId,
      type: 'note',
      x: point.x + ANNOTATION_COMMENT_NOTE_OFFSET_X * scale,
      y: point.y + ANNOTATION_COMMENT_NOTE_OFFSET_Y * scale,
      meta: {
        codesignAnnotationComment: true,
        codesignAnnotationCommentRole: 'note',
        codesignAnnotationCommentMarkerId: markerId
      },
      props: {
        color: 'yellow',
        richText: toRichText(ANNOTATION_COMMENT_TEXT),
        size: 'm',
        font: 'draw',
        align: 'start',
        verticalAlign: 'start',
        labelColor: 'black',
        growY: 0,
        fontSizeAdjustment: 1,
        url: '',
        scale,
        textFirstEditedBy: null
      }
    }
  ])

  startEditingAnnotationComment(editor, noteId)
}

function pinAnnotationArrowLabelPosition(editor, arrowId, attempt = 0) {
  editor.timers.setTimeout(() => {
    const shape = editor.getShape(arrowId)
    if (!shape || shape.meta?.codesignAnnotationArrow !== true) return
    if (shape.props.labelPosition !== ANNOTATION_LABEL_POSITION) {
      editor.updateShapes([
        {
          id: arrowId,
          type: 'arrow',
          props: {
            labelPosition: ANNOTATION_LABEL_POSITION
          }
        }
      ])
    }

    if (attempt < 2 && editor.getEditingShapeId() === arrowId) {
      pinAnnotationArrowLabelPosition(editor, arrowId, attempt + 1)
    }
  }, 16)
}

function unlockGlobalToolLock(editor) {
  if (!editor.getInstanceState().isToolLocked) return
  editor.updateInstanceState({ isToolLocked: false })
}

function selectAnnotationTextWhenReady(editor, arrowId, attempt = 0) {
  editor.timers.setTimeout(() => {
    const editingShapeId = editor.getEditingShapeId()
    if (editingShapeId !== arrowId) return

    const textEditor = editor.getRichTextEditor()
    if (textEditor) {
      textEditor.view.focus()
      textEditor.view.dispatch(
        textEditor.state.tr.setSelection(new AllSelection(textEditor.state.doc)).scrollIntoView()
      )
    }

    const didSelectText = selectAnnotationTextRange(editor, arrowId)
    if (didSelectText && attempt >= ANNOTATION_SELECT_TEXT_SETTLE_ATTEMPTS) {
      return
    }

    if (attempt < ANNOTATION_SELECT_TEXT_MAX_ATTEMPTS) {
      selectAnnotationTextWhenReady(editor, arrowId, attempt + 1)
    }
  }, 16)
}

function selectAnnotationTextRange(editor, arrowId) {
  const doc = editor.getContainerDocument()
  const shapeElement = Array.from(doc.querySelectorAll('[data-shape-id]')).find(
    (element) => element.getAttribute('data-shape-id') === arrowId
  )
  const editable = shapeElement?.querySelector('[contenteditable="true"]')

  if (!editable || typeof editable.focus !== 'function') {
    return false
  }

  editable.focus()

  const textNodes = getTextNodes(editable)
  if (textNodes.length === 0) {
    return doc.activeElement === editable || editable.contains(doc.activeElement)
  }

  const range = doc.createRange()
  const firstTextNode = textNodes[0]
  const lastTextNode = textNodes[textNodes.length - 1]
  range.setStart(firstTextNode, 0)
  range.setEnd(lastTextNode, lastTextNode.textContent?.length ?? 0)

  const selection = doc.getSelection()
  if (!selection) return false

  selection.removeAllRanges()
  selection.addRange(range)
  doc.execCommand?.('selectAll')

  return selection.rangeCount > 0 && selection.toString() === editable.textContent
}

function getTextNodes(node, textNodes = []) {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent) {
      textNodes.push(child)
    } else {
      getTextNodes(child, textNodes)
    }
  }

  return textNodes
}

function getDefaultAnnotationArrowBend(dx, dy, scale) {
  const length = Math.hypot(dx, dy)
  if (length === 0) return 0

  const bend = Math.min(
    Math.max(length * ANNOTATION_BEND_RATIO, ANNOTATION_MIN_BEND * scale),
    ANNOTATION_MAX_BEND * scale
  )

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? -bend : bend
  }

  return bend
}

function getAnnotationColor(editor) {
  const color = editor.getStyleForNextShape(DefaultColorStyle)
  return color === DefaultColorStyle.defaultValue ? ANNOTATION_DEFAULT_COLOR : color
}

class CoDesignAnnotationTool extends StateNode {
  static id = ANNOTATION_TOOL_ID
  static initial = 'idle'

  static children() {
    return [CoDesignAnnotationIdle, CoDesignAnnotationPointing]
  }

  onEnter() {
    unlockGlobalToolLock(this.editor)
  }
}

class CoDesignAnnotationIdle extends StateNode {
  static id = 'idle'

  onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  onPointerDown(info) {
    this.parent.transition('pointing', info)
  }

  onCancel() {
    this.editor.setCurrentTool('select')
  }
}

class CoDesignAnnotationPointing extends StateNode {
  static id = 'pointing'

  arrowId = null
  markId = ''
  origin = null

  onEnter() {
    const origin = this.editor.inputs.getOriginPagePoint()
    const scale = this.editor.getResizeScaleFactor()
    const color = getAnnotationColor(this.editor)
    const arrowId = createShapeId()

    this.arrowId = arrowId
    this.origin = { x: origin.x, y: origin.y }
    this.markId = this.editor.markHistoryStoppingPoint(`creating_annotation:${arrowId}`)

    this.editor.createShape({
      id: arrowId,
      type: 'arrow',
      x: origin.x,
      y: origin.y,
      meta: {
        codesignAnnotationArrow: true
      },
      props: {
        kind: 'arc',
        dash: 'draw',
        size: 'm',
        fill: 'none',
        color,
        labelColor: color,
        bend: 0,
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
        arrowheadStart: 'none',
        arrowheadEnd: 'arrow',
        richText: toRichText(''),
        labelPosition: ANNOTATION_LABEL_POSITION,
        font: 'draw',
        scale
      }
    })
  }

  onPointerMove() {
    this.updateArrowEnd()
  }

  onPointerUp() {
    this.complete()
  }

  onCancel() {
    this.cancel()
  }

  onInterrupt() {
    this.cancel()
  }

  updateArrowEnd() {
    if (!this.arrowId || !this.origin) return

    const point = this.editor.inputs.getCurrentPagePoint()
    this.editor.updateShapes([
      {
        id: this.arrowId,
        type: 'arrow',
        props: {
          end: {
            x: point.x - this.origin.x,
            y: point.y - this.origin.y
          }
        }
      }
    ])
  }

  complete() {
    if (!this.arrowId || !this.origin) {
      this.editor.setCurrentTool(ANNOTATION_TOOL_ID)
      return
    }

    this.updateArrowEnd()

    const point = this.editor.inputs.getCurrentPagePoint()
    const dx = point.x - this.origin.x
    const dy = point.y - this.origin.y
    const length = Math.hypot(dx, dy)

    if (length < ANNOTATION_MIN_LENGTH / this.editor.getZoomLevel()) {
      this.editor.bailToMark(this.markId)
      createAnnotationCommentAtPoint(this.editor, this.origin)
      return
    }

    this.editor.updateShapes([
      {
        id: this.arrowId,
        type: 'arrow',
        props: {
          bend: getDefaultAnnotationArrowBend(dx, dy, this.editor.getResizeScaleFactor())
        }
      }
    ])

    startEditingAnnotationArrowLabel(this.editor, this.arrowId)
  }

  cancel() {
    if (this.arrowId) {
      this.editor.bailToMark(this.markId)
    }
    this.parent.transition('idle')
  }
}

const codesignUiOverrides = {
  translations: {
    en: {
      'tool.ai-image': AI_IMAGE_HOLDER_LABEL,
      'tool.codesign-annotation': ANNOTATION_TOOL_LABEL
    },
    'zh-cn': {
      'tool.ai-image': AI_IMAGE_HOLDER_LABEL,
      'tool.codesign-annotation': ANNOTATION_TOOL_LABEL
    }
  },
  tools(editor, tools) {
    return {
      ...tools,
      arrow: {
        ...tools.arrow,
        kbd: undefined
      },
      [AI_IMAGE_TOOL_ID]: {
        id: AI_IMAGE_TOOL_ID,
        label: 'tool.ai-image',
        icon: 'tool-frame',
        kbd: 'a',
        onSelect() {
          createAiImageHolderAtViewportCenter(editor)
        },
        onDragStart(source, info) {
          const holderSize = getCurrentAiImageHolderSize()
          onDragFromToolbarToCreateShape(editor, info, {
            createShape: (id) =>
              createAiImageHolderShape(editor, id, {
                size: holderSize,
                props: {
                  w: holderSize.width,
                  h: holderSize.height
                }
              }),
            onDragEnd: (id) => editor.select(id)
          })
        },
        meta: {
          codesignTool: 'ai-image-holder'
        }
      },
      [ANNOTATION_TOOL_ID]: {
        id: ANNOTATION_TOOL_ID,
        label: 'tool.codesign-annotation',
        icon: annotationToolIcon,
        kbd: 'c',
        onSelect() {
          unlockGlobalToolLock(editor)
          editor.setCurrentTool(ANNOTATION_TOOL_ID)
        },
        meta: {
          codesignTool: 'annotation'
        }
      }
    }
  }
}

const codesignComponents = {
  Toolbar: CoDesignToolbar
}

function CoDesignToolbarItem({ toolId }) {
  const editor = useEditor()
  const isSelected = useValue(
    `is ${toolId} selected`,
    () => editor.getCurrentToolId() === toolId,
    [editor, toolId]
  )

  return <TldrawUiMenuToolItem toolId={toolId} isSelected={isSelected} />
}

function CoDesignAnnotationToolbarItem() {
  const editor = useEditor()
  const isSelected = useValue(
    'is annotation selected',
    () => editor.getCurrentToolId() === ANNOTATION_TOOL_ID,
    [editor]
  )

  return (
    <button
      aria-label={ANNOTATION_TOOL_LABEL}
      aria-pressed={isSelected ? 'true' : 'false'}
      className="tlui-button tlui-button__tool codesign-annotation-toolbar-button"
      data-testid={`tools.${ANNOTATION_TOOL_ID}`}
      data-value={ANNOTATION_TOOL_ID}
      draggable={false}
      onClick={() => {
        unlockGlobalToolLock(editor)
        editor.setCurrentTool(ANNOTATION_TOOL_ID)
      }}
      onTouchStart={(event) => {
        event.preventDefault()
        unlockGlobalToolLock(editor)
        editor.setCurrentTool(ANNOTATION_TOOL_ID)
      }}
      title={ANNOTATION_TOOL_LABEL}
      type="button"
    >
      {annotationToolIcon}
      <span className="codesign-annotation-toolbar-label" draggable={false}>
        {ANNOTATION_TOOL_LABEL}
      </span>
    </button>
  )
}

function CoDesignAiImageToolbarItem() {
  const editor = useEditor()
  const [isOpen, setIsOpen] = useState(false)
  const [size, setSize] = useState(() => setCurrentAiImageHolderSize(readStoredAiImageHolderSize()))

  function applySize(nextSize) {
    setSize(setCurrentAiImageHolderSize(nextSize))
  }

  function updateCustomDimension(key, value) {
    applySize({
      id: 'custom',
      label: '自定义',
      width: key === 'width' ? value : size.width,
      height: key === 'height' ? value : size.height
    })
  }

  return (
    <div className="codesign-ai-image-toolbar">
      <CoDesignToolbarItem toolId={AI_IMAGE_TOOL_ID} />
      <select
        aria-label="选择 AI 图片尺寸"
        className="codesign-ai-image-size-select"
        onChange={(event) => {
          const nextPreset = AI_IMAGE_HOLDER_PRESETS.find((preset) => preset.id === event.target.value)
          if (nextPreset) {
            applySize(nextPreset)
            setIsOpen(false)
            return
          }

          applySize({
            id: 'custom',
            label: '自定义',
            width: size.width,
            height: size.height
          })
          setIsOpen(true)
        }}
        onFocus={() => {
          if (size.id === 'custom') setIsOpen(true)
        }}
        title={`当前尺寸：${size.label} ${formatAiImageHolderSize(size)}`}
        value={AI_IMAGE_HOLDER_PRESETS.some((preset) => preset.id === size.id) ? size.id : 'custom'}
      >
        {AI_IMAGE_HOLDER_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label} · {formatAiImageHolderSize(preset)}
          </option>
        ))}
        <option value="custom">自定义 · {formatAiImageHolderSize(size)}</option>
      </select>
      {isOpen ? (
        <div className="codesign-ai-image-size-popover" role="dialog" aria-label="AI 图片尺寸">
          <div className="codesign-ai-image-size-header">
            <strong>自定义尺寸</strong>
            <span>{formatAiImageHolderSize(size)}</span>
          </div>
          <div className="codesign-ai-image-custom-size">
            <label>
              宽
              <input
                inputMode="numeric"
                min="64"
                max="4096"
                onChange={(event) => updateCustomDimension('width', event.target.value)}
                type="number"
                value={size.width}
              />
            </label>
            <label>
              高
              <input
                inputMode="numeric"
                min="64"
                max="4096"
                onChange={(event) => updateCustomDimension('height', event.target.value)}
                type="number"
                value={size.height}
              />
            </label>
          </div>
          <button
            className="codesign-ai-image-create-button"
            onClick={() => {
              createAiImageHolderAtViewportCenter(editor)
              setIsOpen(false)
            }}
            type="button"
          >
            创建 {formatAiImageHolderSize(size)}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function CoDesignToolbarDivider() {
  return <div aria-orientation="vertical" className="codesign-toolbar-divider" role="separator" />
}

function CoDesignToolbar(props) {
  return (
    <DefaultToolbar {...props} maxItems={9}>
      <CoDesignAnnotationToolbarItem />
      <CoDesignToolbarDivider />
      <SelectToolbarItem />
      <HandToolbarItem />
      <CoDesignAiImageToolbarItem />
      <CoDesignToolbarDivider />
      <AssetToolbarItem />
      <DrawToolbarItem />
      <EraserToolbarItem />
      <TextToolbarItem />
      <ArrowToolbarItem />
      <NoteToolbarItem />
      <RectangleToolbarItem />
      <EllipseToolbarItem />
      <TriangleToolbarItem />
      <DiamondToolbarItem />
      <HexagonToolbarItem />
      <OvalToolbarItem />
      <RhombusToolbarItem />
      <StarToolbarItem />
      <CloudToolbarItem />
      <HeartToolbarItem />
      <XBoxToolbarItem />
      <CheckBoxToolbarItem />
      <ArrowLeftToolbarItem />
      <ArrowUpToolbarItem />
      <ArrowDownToolbarItem />
      <ArrowRightToolbarItem />
      <LineToolbarItem />
      <HighlightToolbarItem />
      <LaserToolbarItem />
      <FrameToolbarItem />
    </DefaultToolbar>
  )
}

function getCoDesignSelection(editor) {
  const selectedShapeIds = editor.getSelectedShapeIds()
  return selectedShapeIds.map((id) => {
    const shape = editor.getShape(id)
    const asset = shape?.props?.assetId ? editor.getAsset(shape.props.assetId) : null
    return {
      id,
      type: shape?.type ?? null,
      parentId: shape?.parentId ?? null,
      x: shape?.x ?? null,
      y: shape?.y ?? null,
      rotation: shape?.rotation ?? null,
      meta: shape?.meta ?? null,
      isAiImageHolder: shape?.meta?.codesignAiImageHolder === true,
      props: shape?.props ?? null,
      asset: asset
        ? {
            id: asset.id,
            type: asset.type,
            name: asset.props?.name ?? null,
            src: asset.props?.src ?? null,
            w: asset.props?.w ?? null,
            h: asset.props?.h ?? null,
            mimeType: asset.props?.mimeType ?? null,
            fileSize: asset.props?.fileSize ?? null
          }
        : null
    }
  })
}

function getCoDesignSelectionSnapshot(editor) {
  return {
    selectedShapes: getCoDesignSelection(editor)
  }
}

function getCoDesignViewState(editor) {
  const camera = editor.getCamera()
  return {
    version: 1,
    currentPageId: editor.getCurrentPageId(),
    camera: {
      x: camera.x,
      y: camera.y,
      z: camera.z
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    }
  }
}

function isRestorableViewState(viewState) {
  return (
    viewState &&
    typeof viewState === 'object' &&
    typeof viewState.currentPageId === 'string' &&
    viewState.camera &&
    Number.isFinite(viewState.camera.x) &&
    Number.isFinite(viewState.camera.y) &&
    Number.isFinite(viewState.camera.z)
  )
}

function restoreCoDesignViewState(editor, viewState) {
  if (!isRestorableViewState(viewState)) return
  if (!editor.getPage(viewState.currentPageId)) return

  editor.setCurrentPage(viewState.currentPageId)
  editor.setCamera(viewState.camera, { immediate: true, force: true })
}

function writeCoDesignSelectionState(selectionSnapshot) {
  let stateElement = document.getElementById(SELECTION_STATE_ELEMENT_ID)
  if (!stateElement) {
    stateElement = document.createElement('script')
    stateElement.id = SELECTION_STATE_ELEMENT_ID
    stateElement.type = 'application/json'
    document.body.append(stateElement)
  }

  stateElement.textContent = JSON.stringify({
    ...selectionSnapshot,
    updatedAt: new Date().toISOString()
  })
}

export default function App() {
  const [snapshot, setSnapshot] = useState()
  const [viewState, setViewState] = useState()
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadCanvas() {
      try {
        const [canvasResponse, viewStateResponse] = await Promise.all([
          fetch(CANVAS_ENDPOINT, { signal: controller.signal }),
          fetch(VIEW_STATE_ENDPOINT, { signal: controller.signal })
        ])
        if (!canvasResponse.ok) {
          throw new Error(`Failed to load canvas: ${canvasResponse.status}`)
        }
        if (!viewStateResponse.ok) {
          throw new Error(`Failed to load canvas view state: ${viewStateResponse.status}`)
        }
        const [canvasData, viewStateData] = await Promise.all([
          canvasResponse.json(),
          viewStateResponse.json()
        ])
        setSnapshot(canvasData.snapshot ?? null)
        setViewState(viewStateData.viewState ?? null)
      } catch (error) {
        if (error.name === 'AbortError') return
        setLoadError(error)
        setSnapshot(null)
        setViewState(null)
      }
    }

    loadCanvas()

    return () => controller.abort()
  }, [])

  const handleMount = useCallback((editor) => {
    window.__codesignEditor = editor
    window.__codesignSelection = () => getCoDesignSelection(editor)
    window.__codesignViewState = () => getCoDesignViewState(editor)
    let lastSyncedSelectionState = ''
    let isSelectionStateSaving = false
    let hasPendingSelectionState = false
    let lastSyncedViewState = ''
    let isViewStateSaving = false
    let hasPendingViewState = false

    editor.timers.requestAnimationFrame(() => {
      restoreCoDesignViewState(editor, viewState)
    })

    async function syncSelectionState() {
      const selectionSnapshot = getCoDesignSelectionSnapshot(editor)
      writeCoDesignSelectionState(selectionSnapshot)

      const selectionState = JSON.stringify(selectionSnapshot)
      if (selectionState === lastSyncedSelectionState) return
      lastSyncedSelectionState = selectionState

      if (isSelectionStateSaving) {
        hasPendingSelectionState = true
        return
      }

      isSelectionStateSaving = true
      try {
        const response = await fetch(SELECTION_ENDPOINT, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...selectionSnapshot,
            updatedAt: new Date().toISOString()
          })
        })
        if (!response.ok) {
          throw new Error(`Failed to save selection: ${response.status}`)
        }
      } catch (error) {
        console.error(error)
      } finally {
        isSelectionStateSaving = false
        if (hasPendingSelectionState) {
          hasPendingSelectionState = false
          syncSelectionState()
        }
      }
    }

    syncSelectionState()
    const selectionStateTimer = window.setInterval(syncSelectionState, 250)

    async function syncViewState() {
      const viewStateSnapshot = {
        ...getCoDesignViewState(editor),
        updatedAt: new Date().toISOString()
      }

      const nextViewState = JSON.stringify(viewStateSnapshot)
      if (nextViewState === lastSyncedViewState) return
      lastSyncedViewState = nextViewState

      if (isViewStateSaving) {
        hasPendingViewState = true
        return
      }

      isViewStateSaving = true
      try {
        const response = await fetch(VIEW_STATE_ENDPOINT, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: nextViewState
        })
        if (!response.ok) {
          throw new Error(`Failed to save view state: ${response.status}`)
        }
      } catch (error) {
        console.error(error)
      } finally {
        isViewStateSaving = false
        if (hasPendingViewState) {
          hasPendingViewState = false
          syncViewState()
        }
      }
    }

    const viewStateTimer = window.setInterval(syncViewState, 500)
    editor.timers.setTimeout(syncViewState, 100)

    let saveTimer = null
    let isSaving = false
    let hasPendingSave = false
    let hasUnsavedChanges = false
    let isSyncingAnnotationShape = false
    let remoteLoadController = null

    async function saveCanvas() {
      if (!hasUnsavedChanges) return

      if (isSaving) {
        hasPendingSave = true
        return
      }

      isSaving = true
      try {
        const body = JSON.stringify(editor.store.getStoreSnapshot())
        const response = await fetch(CANVAS_ENDPOINT, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body
        })
        if (!response.ok) {
          throw new Error(`Failed to save canvas: ${response.status}`)
        }
        hasUnsavedChanges = false
      } catch (error) {
        console.error(error)
      } finally {
        isSaving = false
        if (hasPendingSave) {
          hasPendingSave = false
          scheduleSave()
        }
      }
    }

    function scheduleSave() {
      hasUnsavedChanges = true
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(saveCanvas, 500)
    }

    async function loadRemoteCanvasSnapshot() {
      remoteLoadController?.abort()
      const controller = new AbortController()
      remoteLoadController = controller
      const preserveLocalChanges = hasUnsavedChanges || isSaving

      try {
        const response = await fetch(CANVAS_ENDPOINT, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Failed to refresh canvas: ${response.status}`)
        }

        const canvasData = await response.json()
        const changedRecords = applyRemoteCanvasSnapshot(editor, canvasData.snapshot, {
          preserveLocalChanges
        })

        if (changedRecords > 0 && preserveLocalChanges) {
          hasUnsavedChanges = true
          if (isSaving) {
            hasPendingSave = true
          } else {
            scheduleSave()
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') return
        console.error(error)
      } finally {
        if (remoteLoadController === controller) {
          remoteLoadController = null
        }
      }
    }

    const unsubscribe = editor.store.listen(scheduleSave, {
      source: 'user',
      scope: 'document'
    })

    let canvasEvents = null
    if ('EventSource' in window) {
      canvasEvents = new EventSource(CANVAS_EVENTS_ENDPOINT)
      canvasEvents.addEventListener('canvas-changed', loadRemoteCanvasSnapshot)
      canvasEvents.onerror = (error) => {
        console.warn('Code Design canvas live refresh disconnected.', error)
      }
    }

    const unsubscribeAnnotationEditingToolLock = editor.store.listen(
      ({ changes }) => {
        for (const [previous, next] of Object.values(changes.updated)) {
          if (previous?.typeName !== 'instance_page_state') continue
          if (!previous.editingShapeId || next.editingShapeId) continue

          const shape = editor.getShape(previous.editingShapeId)
          if (shape?.meta?.codesignAnnotationArrow !== true) continue

          editor.timers.requestAnimationFrame(() => {
            if (editor.getEditingShapeId()) return
            if (editor.getCurrentToolId() !== 'select') return
            editor.setCurrentTool(ANNOTATION_TOOL_ID)
          })
        }
      },
      {
        source: 'all',
        scope: 'session'
      }
    )

    const unsubscribeAnnotationShapeSync = editor.store.listen(
      ({ changes }) => {
        if (isSyncingAnnotationShape) return

        const updates = []
        for (const [_previous, next] of Object.values(changes.updated)) {
          if (next?.typeName !== 'shape') continue
          if (next.type !== 'arrow') continue
          if (next.meta?.codesignAnnotationArrow !== true) continue

          const props = {}
          if (next.props?.color !== next.props?.labelColor) {
            props.labelColor = next.props.color
          }
          if (next.props?.labelPosition !== ANNOTATION_LABEL_POSITION) {
            props.labelPosition = ANNOTATION_LABEL_POSITION
          }

          if (Object.keys(props).length === 0) continue

          updates.push({
            id: next.id,
            type: 'arrow',
            props
          })
        }

        if (updates.length === 0) return

        isSyncingAnnotationShape = true
        try {
          editor.updateShapes(updates)
        } finally {
          isSyncingAnnotationShape = false
        }
      },
      {
        source: 'all',
        scope: 'document'
      }
    )

    return () => {
      window.clearTimeout(saveTimer)
      window.clearInterval(selectionStateTimer)
      window.clearInterval(viewStateTimer)
      remoteLoadController?.abort()
      canvasEvents?.close()
      if (window.__codesignEditor === editor) {
        delete window.__codesignEditor
        delete window.__codesignSelection
        delete window.__codesignViewState
      }
      document.getElementById(SELECTION_STATE_ELEMENT_ID)?.remove()
      unsubscribe()
      unsubscribeAnnotationEditingToolLock()
      unsubscribeAnnotationShapeSync()
      syncViewState()
      saveCanvas()
    }
  }, [viewState])

  if (snapshot === undefined || viewState === undefined) {
    return (
      <main className="codesign-status" aria-live="polite">
        Loading canvas...
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="codesign-status" aria-live="polite">
        Canvas file could not be loaded.
      </main>
    )
  }

  return (
    <main className="codesign-canvas" aria-label="Code Design infinite canvas">
      <Tldraw
        snapshot={snapshot ?? undefined}
        inferDarkMode
        onMount={handleMount}
        overrides={codesignUiOverrides}
        components={codesignComponents}
        tools={[CoDesignAnnotationTool]}
      />
    </main>
  )
}
