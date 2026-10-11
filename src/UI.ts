/**
 * UI Module - DOM manipulation and event handling
 */

import {
  Minesweeper,
  DIFFICULTY,
  STATE,
  CELL_STATE,
  type Cell,
  type CellMarker,
  type Coordinate,
  type GameConfig,
  type StandardDifficulty
} from './Game.ts';
import { formatLedNumber, getStandardDifficulty } from './utils.ts';
import type { ThemeController } from './theme.ts';

type TouchMode = 'question' | 'flag' | 'click';
type FaceState = 'normal' | 'surprised' | 'dead' | 'won' | 'pause' | 'resume';
type Difficulty = StandardDifficulty | 'custom';
type MenuAction = 'new' | 'difficulty' | 'custom' | 'theme' | 'controls' | 'about';
type ThemeMenuDependency = Pick<ThemeController, 'cycle' | 'getMenuLabel'>;

const ZOOM_LEVELS = [75, 100, 125, 150, 175, 200] as const;
type ZoomLevel = typeof ZOOM_LEVELS[number];

interface TouchGestureCell extends Coordinate {
  element: HTMLButtonElement;
}

interface UIElements {
  window: HTMLDivElement;
  zoomOutBtn: HTMLButtonElement;
  zoomResetBtn: HTMLButtonElement;
  zoomInBtn: HTMLButtonElement;
  menubar: HTMLDivElement;
  boardFrame: HTMLDivElement;
  board: HTMLDivElement;
  pauseOverlay: HTMLDivElement;
  cells: Map<string, HTMLButtonElement>;
  faceBtn: HTMLButtonElement;
  timerDisplay: HTMLDivElement;
  mineCountDisplay: HTMLDivElement;
  menuItems: Map<string, HTMLDivElement>;
  touchActionPanel: HTMLDivElement;
  touchModeButtons: Map<TouchMode, HTMLButtonElement>;
  menuDropdowns: Partial<Record<'game' | 'help', HTMLDivElement>>;
  themeMenuItem: HTMLDivElement | null;
  difficultyCheckmarks: Partial<Record<Difficulty, HTMLDivElement>>;
}

interface MenuActionItem {
  label: string;
  action: MenuAction;
  menuId: string;
  value?: Difficulty;
  shortcut?: string;
  difficulty?: GameConfig;
  isDifficulty?: boolean;
}

type GameMenuItem = MenuActionItem | { type: 'separator' };

interface ClosestTarget extends EventTarget {
  closest<T extends Element = Element>(selector: string): T | null;
}

function hasClosest(target: EventTarget | null): target is ClosestTarget {
  return target !== null && 'closest' in target && typeof target.closest === 'function';
}

function closestElement<T extends Element>(event: Event, selector: string): T | null {
  return hasClosest(event.target) ? event.target.closest<T>(selector) : null;
}

function getCellCoordinates(cell: HTMLElement): Coordinate {
  return {
    x: Number.parseInt(cell.dataset.x ?? '', 10),
    y: Number.parseInt(cell.dataset.y ?? '', 10)
  };
}

export class UI {
  game: Minesweeper;
  themeController: ThemeMenuDependency | undefined;
  touchMode: TouchMode;
  faceState: FaceState;
  boardWidth: number;
  boardHeight: number;
  focusX: number;
  focusY: number;
  leftPressed: boolean;
  rightPressed: boolean;
  chordAnchor: Coordinate | null;
  chordHandled: boolean;
  chordGestureActive: boolean;
  touchGestureCell: TouchGestureCell | null;
  zoomLevel: ZoomLevel;
  element: UIElements;
  timerInterval: number | null;
  uiUpdateValue: number | null;

  constructor(game: Minesweeper, themeController?: ThemeMenuDependency) {
    this.game = game;
    this.themeController = themeController;
    this.touchMode = 'click';
    this.faceState = 'normal';
    this.boardWidth = game.width;
    this.boardHeight = game.height;
    this.focusX = 0;
    this.focusY = 0;
    this.leftPressed = false;
    this.rightPressed = false;
    this.chordAnchor = null; // {x, y} for chord gesture
    this.chordHandled = false; // whether chord was executed
    this.chordGestureActive = false; // true when both buttons pressed
    this.touchGestureCell = null;
    this.zoomLevel = 100;

    // DOM references are populated synchronously by createDOM() below.
    this.element = {
      window: null,
      zoomOutBtn: null,
      zoomResetBtn: null,
      zoomInBtn: null,
      menubar: null,
      boardFrame: null,
      board: null,
      pauseOverlay: null,
      cells: new Map(),
      faceBtn: null,
      timerDisplay: null,
      mineCountDisplay: null,
      menuItems: new Map(),
      touchActionPanel: null,
      touchModeButtons: new Map(),
      menuDropdowns: {},
      themeMenuItem: null,
      difficultyCheckmarks: {}
    } as unknown as UIElements;

    this.timerInterval = null;
    this.uiUpdateValue = null;
    this.init();
  }

  /**
   * Инициализация UI
   */
  init(): void {
    this.createDOM();
    this.setupEventListeners();
    this.startUIUpdate();
  }

  /**
   * Создание DOM-элементов
   */
  createDOM(): void {
    const container = document.body;

    // Main window
    this.element.window = document.createElement('div');
    this.element.window.className = 'window';

    // Title bar - Windows 95 style, no gradient, solid blue
    const titleBar = document.createElement('div');
    titleBar.className = 'title-bar';
    titleBar.style.backgroundColor = '#000080';
    const titleText = document.createElement('span');
    titleText.className = 'title-text';
    titleText.textContent = 'Сапёр';

    const windowControls = document.createElement('div');
    windowControls.className = 'window-controls';

    this.element.zoomOutBtn = this.createZoomButton('−', 'zoom-out-control');
    this.element.zoomResetBtn = this.createZoomButton('100%', 'zoom-reset-control');
    this.element.zoomResetBtn.setAttribute('aria-live', 'polite');
    this.element.zoomResetBtn.setAttribute('aria-atomic', 'true');
    this.element.zoomInBtn = this.createZoomButton('+', 'zoom-in-control');

    windowControls.append(
      this.element.zoomOutBtn,
      this.element.zoomResetBtn,
      this.element.zoomInBtn
    );
    titleBar.append(titleText, windowControls);
    this.element.window.appendChild(titleBar);
    this.updateZoomUI();

    // Menu bar
    this.element.menubar = document.createElement('div');
    this.element.menubar.className = 'menubar';
    this.createMenu();
    this.element.window.appendChild(this.element.menubar);

    // Board area
    const boardArea = document.createElement('div');
    boardArea.className = 'board-area';

    // Controls
    const controls = document.createElement('div');
    controls.className = 'controls';

    this.element.mineCountDisplay = this.createLedDisplay(10);
    this.element.faceBtn = this.createFaceButton();
    this.element.faceBtn.id = "face-btn";
    this.setFaceState("normal");
    this.element.timerDisplay = this.createLedDisplay(0);

    controls.appendChild(this.element.mineCountDisplay);
    controls.appendChild(this.element.faceBtn);
    controls.appendChild(this.element.timerDisplay);
    boardArea.appendChild(controls);

    // Game board and pause layer
    this.element.boardFrame = document.createElement('div');
    this.element.boardFrame.className = 'board-frame';

    this.element.board = document.createElement('div');
    this.element.board.className = 'board';
    this.element.board.setAttribute('role', 'grid');
    this.element.board.setAttribute('aria-label', 'Игровое поле');
    this.element.board.setAttribute('aria-readonly', 'true');
    this.element.board.style.setProperty('--board-width', String(this.boardWidth));
    this.element.board.style.setProperty('--board-height', String(this.boardHeight));
    this.createBoardCells();

    this.element.pauseOverlay = document.createElement('div');
    this.element.pauseOverlay.className = 'pause-overlay';
    this.element.pauseOverlay.hidden = true;
    this.element.pauseOverlay.setAttribute('role', 'status');
    this.element.pauseOverlay.setAttribute('aria-live', 'polite');
    this.element.pauseOverlay.setAttribute('aria-hidden', 'true');
    this.element.pauseOverlay.innerHTML = `
      <span class="pause-overlay-icon" aria-hidden="true">Ⅱ</span>
      <span>Игра на паузе</span>
    `;

    this.element.boardFrame.appendChild(this.element.board);
    this.element.boardFrame.appendChild(this.element.pauseOverlay);
    boardArea.appendChild(this.element.boardFrame);

    // Touch controls
    this.element.touchActionPanel = document.createElement('div');
    this.element.touchActionPanel.className = 'touch-controls';
    this.element.touchActionPanel.setAttribute('role', 'group');
    this.element.touchActionPanel.setAttribute('aria-label', 'Действие при касании');

    const touchActions: readonly { mode: TouchMode; label: string }[] = [
      { mode: 'question', label: 'Вопрос' },
      { mode: 'flag', label: 'Флаг' },
      { mode: 'click', label: 'Клик' }
    ];
    for (const action of touchActions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'touch-action-button';
      button.dataset.touchMode = action.mode;
      button.textContent = action.label;
      button.setAttribute('aria-label', `${action.label}: действие при касании`);
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => this.handleTouchModeClick(action.mode));
      this.element.touchActionPanel.appendChild(button);
      this.element.touchModeButtons.set(action.mode, button);
    }
    this.updateTouchModeUI();
    boardArea.appendChild(this.element.touchActionPanel);

    this.updateGameStateUI();

    this.element.window.appendChild(boardArea);
    container.appendChild(this.element.window);

    // Menu dropdowns
    this.createMenuDropdowns();
  }

  /**
   * Создание меню
   */
  createMenu(): void {
    const menuItems = [
      { label: 'Игра', id: 'menu-game-dropdown', submenu: true },
      { label: 'Справка', id: 'menu-help-dropdown', submenu: true }
    ];

    for (const item of menuItems) {
      const el = document.createElement('div');
      el.className = `menu-item ${item.submenu ? 'has-submenu' : ''}`;
      el.textContent = item.label;
      el.dataset.menuId = item.id;
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '-1');
      this.element.menubar.appendChild(el);
      this.element.menuItems.set(item.id, el);
    }
  }

  /**
   * Создание выпадающих меню
   */
  createMenuDropdowns(): void {
    // Game menu
    const gameMenu = document.createElement('div');
    gameMenu.className = 'menu-dropdown';
    gameMenu.id = 'menu-game-dropdown';
    gameMenu.setAttribute('role', 'menu');

    const gameItems: GameMenuItem[] = [
      { label: 'Новая игра', action: 'new', shortcut: 'F2', menuId: 'menu-game-dropdown' },
      { type: 'separator' },
      { label: 'Новичок', action: 'difficulty', value: 'beginner', difficulty: DIFFICULTY.BEGINNER, menuId: 'menu-game-dropdown' },
      { label: 'Любитель', action: 'difficulty', value: 'intermediate', difficulty: DIFFICULTY.INTERMEDIATE, menuId: 'menu-game-dropdown' },
      { label: 'Профессионал', action: 'difficulty', value: 'expert', difficulty: DIFFICULTY.EXPERT, menuId: 'menu-game-dropdown' },
      { label: 'Особый...', action: 'custom', value: 'custom', isDifficulty: true, menuId: 'menu-game-dropdown' },
      { type: 'separator' },
      { label: 'Тема: система', action: 'theme', menuId: 'menu-game-dropdown' }
    ];

    for (const item of gameItems) {
      if ('type' in item) {
        const sep = document.createElement('div');
        sep.className = 'menu-separator';
        gameMenu.appendChild(sep);
        continue;
      }

      const el = document.createElement('div');
      el.className = 'menu-item';
      el.setAttribute('role', 'menuitem');
      el.setAttribute('tabindex', '-1');
      el.textContent = item.label;
      el.dataset.action = item.action;
      el.dataset.value = item.value || '';
      el.dataset.menuId = item.menuId;

      if ((item.difficulty || item.isDifficulty) && item.value) {
        el.classList.add('has-checkmark');
        this.element.difficultyCheckmarks[item.value] = el;
        if (item.value === 'beginner') {
          el.classList.add('checked');
        }
      } else if (item.action === 'theme') {
        // Store theme menu item reference
        this.element.themeMenuItem = el;
        // Set initial label from controller if available
        this.updateThemeMenuItemLabel();
      } else {
        if (item.shortcut) {
          const shortcut = document.createElement('span');
          shortcut.style.float = 'right';
          shortcut.textContent = item.shortcut;
          el.appendChild(shortcut);
        }
      }

      gameMenu.appendChild(el);
    }

    document.body.appendChild(gameMenu);

    // Help menu
    const helpMenu = document.createElement('div');
    helpMenu.className = 'menu-dropdown';
    helpMenu.id = 'menu-help-dropdown';
    helpMenu.setAttribute('role', 'menu');

    const helpItems = [
      { label: 'Управление', action: 'controls', menuId: 'menu-help-dropdown' },
      { label: 'О программе', action: 'about', menuId: 'menu-help-dropdown' }
    ];

    for (const item of helpItems) {
      const el = document.createElement('div');
      el.className = 'menu-item';
      el.textContent = item.label;
      el.dataset.action = item.action;
      el.dataset.menuId = item.menuId;
      el.setAttribute('role', 'menuitem');
      el.setAttribute('tabindex', '-1');
      helpMenu.appendChild(el);
    }

    document.body.appendChild(helpMenu);

    // Store references
    this.element.menuDropdowns = {
      game: gameMenu,
      help: helpMenu
    };

    // Menu item elements
    this.element.menuItems.set('menu-game-dropdown', gameMenu);
    this.element.menuItems.set('menu-help-dropdown', helpMenu);
  }

  /**
   * Создание семисегментного LED-дисплея
   * @param {number} value
   * @returns {HTMLElement}
   */
  createLedDisplay(value: number): HTMLDivElement {
    const display = document.createElement('div');
    display.className = 'led-display';
    display.setAttribute('role', 'status');
    display.setAttribute('aria-live', 'polite');
    display.dataset.value = String(value);

    const formatted = formatLedNumber(value);
    display.innerHTML = this.renderSevenSegment(formatted);
    return display;
  }

  /**
   * Рендер семисегментного отображения
   * @param {string} value
   * @returns {string}
   */
  renderSevenSegment(value: string): string {
    const segments: Record<string, string> = {
      '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
      '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
      '-': 'g', ' ': ''
    };

    let html = '';
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      const segs = segments[char] || '';
      let digitHtml = '<span class="digit-seg">';
      for (const seg of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
        if (segs.includes(seg)) {
          digitHtml += `<span class="seg ${seg} active"></span>`;
        } else {
          digitHtml += `<span class="seg ${seg}"></span>`;
        }
      }
      digitHtml += '</span>';
      html += digitHtml;
    }
    return html;
  }

  /**
   * Создание кнопки-лица
   * @returns {HTMLElement}
   */
  createFaceButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'face-button';
    btn.setAttribute('aria-label', 'Начать новую игру');
    btn.setAttribute('tabindex', '-1');
    // Generate SVG for normal state without touching DOM
    btn.innerHTML = this.getFaceSvg('normal');
    return btn;
  }

  createZoomButton(text: string, className: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `window-control ${className}`;
    button.textContent = text;
    return button;
  }

  /**
   * Создание ячеек игрового поля
   */
  createBoardCells(): void {
    this.element.board.innerHTML = '';
    this.element.cells.clear();

    for (let y = 0; y < this.boardHeight; y++) {
      for (let x = 0; x < this.boardWidth; x++) {
        const cell = document.createElement('button');
        cell.className = 'cell';
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        cell.setAttribute('role', 'button');
        cell.setAttribute('aria-label', `Клетка ${x + 1},${y + 1}`);
        cell.setAttribute('aria-pressed', 'false');
        cell.setAttribute('tabindex', '-1');
        this.element.board.appendChild(cell);
        this.element.cells.set(`${x},${y}`, cell);
      }
    }
  }

  /**
   * Настройка обработчиков событий
   */
  setupEventListeners(): void {
    this.element.zoomOutBtn.addEventListener('click', () => this.zoomOut());
    this.element.zoomResetBtn.addEventListener('click', () => this.resetZoom());
    this.element.zoomInBtn.addEventListener('click', () => this.zoomIn());

    // Face button
    this.element.faceBtn.addEventListener('click', () => this.handleFaceClick());
    // CSS :active handles visual feedback; click dispatches the action for the current game state.

    // Global mouseup - handle cleanup for drag-out outside board
    document.addEventListener('mouseup', (e: MouseEvent) => {
      // If mouseup is on a cell, board handler already processed it - do nothing
      if (closestElement(e, '.cell')) return;

      // For mouseup outside board cells, update pressed states from e.buttons
      this.leftPressed = Boolean(e.buttons & 1);
      this.rightPressed = Boolean(e.buttons & 2);

      // Clear board pressing
      this.clearBoardPressing();

      // If chord gesture was active, cancel it (chordHandled=true prevents second chord)
      if (this.chordGestureActive) {
        this.chordHandled = true;
      }

      // If both buttons now released, reset chord state and face
      if (!this.leftPressed && !this.rightPressed) {
        this.chordAnchor = null;
        this.chordHandled = false;
        this.chordGestureActive = false;
        if (this.faceState === 'surprised') {
          this.updateGameStateUI();
        }
      }
    });

    // Board events
    this.element.board.addEventListener('mousedown', (e) => this.handleBoardMouseDown(e));
    this.element.board.addEventListener('mouseup', (e) => this.handleBoardMouseUp(e));
    this.element.board.addEventListener('contextmenu', (e) => e.preventDefault());
    this.element.board.addEventListener('mouseleave', () => {
      this.clearBoardPressing();
    });
    this.element.board.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    this.element.board.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    this.element.board.addEventListener('touchcancel', (e) => this.handleTouchCancel(e));
    this.element.board.addEventListener('touchmove', (e) => this.handleTouchMove(e));

    this.setupMenuListeners();
  }

  /**
   * Настройка обработчиков меню
   */
  setupMenuListeners(): void {
    // Menu items in menubar
    const menuItems = this.element.menubar.querySelectorAll<HTMLElement>('.menu-item');
    for (const item of menuItems) {
      item.addEventListener('click', (e) => this.handleMenuClick(e));
    }

    // Dropdown items
    const dropdownItems = document.querySelectorAll<HTMLElement>('.menu-dropdown .menu-item');
    for (const item of dropdownItems) {
      item.addEventListener('click', (e) => this.handleDropdownClick(e));
    }

    // Close menus on click outside
    document.addEventListener('click', (e: MouseEvent) => {
      if (!closestElement(e, '.menubar') && !closestElement(e, '.menu-dropdown')) {
        this.closeAllMenus();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllMenus();
      }
    });
  }

  zoomOut(): void {
    const currentIndex = ZOOM_LEVELS.indexOf(this.zoomLevel);
    const nextLevel = ZOOM_LEVELS[currentIndex - 1];
    if (nextLevel !== undefined) {
      this.setZoomLevel(nextLevel);
    }
  }

  resetZoom(): void {
    this.setZoomLevel(100);
  }

  zoomIn(): void {
    const currentIndex = ZOOM_LEVELS.indexOf(this.zoomLevel);
    const nextLevel = ZOOM_LEVELS[currentIndex + 1];
    if (nextLevel !== undefined) {
      this.setZoomLevel(nextLevel);
    }
  }

  setZoomLevel(level: ZoomLevel): void {
    this.zoomLevel = level;
    this.updateZoomUI();
  }

  updateZoomUI(): void {
    const currentIndex = ZOOM_LEVELS.indexOf(this.zoomLevel);
    const lowerLevel = ZOOM_LEVELS[currentIndex - 1];
    const higherLevel = ZOOM_LEVELS[currentIndex + 1];
    const zoomFactor = String(this.zoomLevel / 100);

    this.element.window.style.setProperty('--game-zoom', zoomFactor);
    this.element.window.dataset.zoom = String(this.zoomLevel);

    this.element.zoomOutBtn.disabled = lowerLevel === undefined;
    this.element.zoomInBtn.disabled = higherLevel === undefined;
    this.element.zoomResetBtn.textContent = `${this.zoomLevel}%`;

    const zoomOutLabel = lowerLevel === undefined
      ? `Уменьшить масштаб — минимальный масштаб ${this.zoomLevel}%`
      : `Уменьшить масштаб до ${lowerLevel}%`;
    const zoomInLabel = higherLevel === undefined
      ? `Увеличить масштаб — максимальный масштаб ${this.zoomLevel}%`
      : `Увеличить масштаб до ${higherLevel}%`;
    const resetLabel = `Сбросить масштаб до 100%. Текущий масштаб: ${this.zoomLevel}%`;

    this.element.zoomOutBtn.setAttribute('aria-label', zoomOutLabel);
    this.element.zoomOutBtn.title = zoomOutLabel;
    this.element.zoomResetBtn.setAttribute('aria-label', resetLabel);
    this.element.zoomResetBtn.title = resetLabel;
    this.element.zoomInBtn.setAttribute('aria-label', zoomInLabel);
    this.element.zoomInBtn.title = zoomInLabel;
  }

  /**
   * Обработка клика по кнопке-лицу
   */
  handleFaceClick(): void {
    if (this.game.state === STATE.RUNNING) {
      this.game.pause();
      this.updateGameStateUI();
    } else if (this.game.state === STATE.PAUSED) {
      this.game.resume();
      this.updateGameStateUI();
    } else if (this.game.state === STATE.WON || this.game.state === STATE.LOST) {
      this.resetGame();
    }
  }

  /**
   * Обработка клика по элементу меню (открытие выпадающего меню)
   * @param {MouseEvent} e
   */
  handleMenuClick(e: MouseEvent): void {
    // Find the closest .menu-item with dataset.menuId
    const item = closestElement<HTMLDivElement>(e, '.menu-item');
    if (!item || !item.dataset.menuId) return;

    const menuId = item.dataset.menuId;
    const dropdown = this.element.menuItems.get(menuId);

    if (!dropdown) return;

    // Check if clicking the same menu that's already open BEFORE closing others
    const isAlreadyOpen = dropdown.classList.contains('show');

    // Close all other menus
    this.closeAllMenus();

    // If clicking the same menu that's already open, just close it and return
    if (isAlreadyOpen) {
      dropdown.classList.remove('show');
      dropdown.style.position = '';
      dropdown.style.left = '';
      dropdown.style.top = '';
      return;
    }

    // Open the clicked dropdown
    dropdown.classList.add('show');

    // Set position using getBoundingClientRect
    const rect = item.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.top = (rect.bottom + 2) + 'px';
  }

  /**
   * Обработка клика по элементу выпадающего меню (выполнение действия)
   * @param {MouseEvent} e
   */
  handleDropdownClick(e: MouseEvent): void {
    // Find the item and action
    const item = closestElement<HTMLDivElement>(e, '.menu-item');
    if (!item || !item.dataset.action) return;

    const action = item.dataset.action;
    const value = item.dataset.value || '';

    // Immediately close all menus
    this.closeAllMenus();

    // Execute action
    switch (action) {
      case 'new':
        this.resetGame();
        break;

      case 'difficulty':
        this.setDifficulty(value);
        this.updateDifficultyCheckmarks(value);
        break;

      case 'custom':
        this.openCustomDialog();
        break;

      case 'theme':
        // Close all menus first (already done at start of function)
        // Cycle theme and update label if controller is available
        this.themeController?.cycle();
        if (this.element.themeMenuItem && this.themeController) {
          this.element.themeMenuItem.textContent = this.themeController.getMenuLabel();
        }
        break;

      case 'controls':
      case 'about':
        // Open appropriate dialog
        if (action === 'controls') {
          this.openControlsDialog();
        } else {
          this.openAboutDialog();
        }
        break;
    }
  }

  /**
   * Обработка нажатия мыши на поле
   */
  handleBoardMouseDown(e: MouseEvent): void {
    if (this.game.state === STATE.PAUSED) return;

    const wasLeftPressed = this.leftPressed;
    const wasRightPressed = this.rightPressed;

    if (e.button === 0) {
      this.leftPressed = true;
      this.setFaceState('surprised');
    }
    if (e.button === 2) {
      this.rightPressed = true;
      this.setFaceState('surprised');
    }

    const cell = closestElement<HTMLButtonElement>(e, '.cell');
    if (cell) {
      const { x, y } = getCellCoordinates(cell);
      this.highlightCellPress(x, y, true);

      // Remember gesture anchor on first mouse button press
      if (!this.chordAnchor && (e.button === 0 || e.button === 2)) {
        this.chordAnchor = { x, y };
      }

      // chordGestureActive = true when both buttons pressed
      if (this.leftPressed && this.rightPressed) {
        this.chordGestureActive = true;
        // Preview ALL CLOSED/QUESTIONED neighbors via classList.add('pressing') regardless flag count
        this.highlightChordNeighbors(x, y);
      } else if (e.button === 0) {
        // Single left click - check if chord preview needed (revealed cell with neighbors > 0)
        const gameCell = this.game.getCell(x, y);
        if (gameCell && gameCell.state === CELL_STATE.REVEALED && gameCell.neighbors > 0) {
          // Preview ALL CLOSED/QUESTIONED neighbors (not FLAGGED, not REVEALED)
          this.highlightChordNeighbors(x, y);
        }
      }
    }
  }

  /**
   * Обработка отпускания мыши на поле
   */
  handleBoardMouseUp(e: MouseEvent): void {
    if (this.game.state === STATE.PAUSED) return;

    // Save wasChord state BEFORE modifying button state
    const wasChord = this.chordGestureActive;
    const anchor = this.chordAnchor;

    // Update button state
    if (e.button === 0) this.leftPressed = false;
    if (e.button === 2) this.rightPressed = false;

    // Determine if this is the first mouseup in a chord gesture
    const isChordFirstUp = wasChord && !this.chordHandled;

    // Execute chord once at anchor on first mouseup
    if (isChordFirstUp && anchor) {
      const gameCell = this.game.getCell(anchor.x, anchor.y);
      if (gameCell && gameCell.state === CELL_STATE.REVEALED && gameCell.neighbors > 0) {
        this.handleCellChord(anchor.x, anchor.y);
        this.chordHandled = true;
      }
    }

    // Suppress ALL clicks during chord gesture (first and second mouseup)
    if (wasChord) {
      // Clear preview on chord suppression
      this.clearBoardPressing();

      // Clear gesture only when both buttons released
      if (!this.leftPressed && !this.rightPressed) {
        this.chordAnchor = null;
        this.chordHandled = false;
        this.chordGestureActive = false;
        if (this.faceState === 'surprised') {
          this.updateGameStateUI();
        }
      }
      return;
    }

    // Regular click processing
    const cell = closestElement<HTMLButtonElement>(e, '.cell');
    if (cell) {
      const { x, y } = getCellCoordinates(cell);

      // Check if revealed with neighbors for single left chord
      const gameCell = this.game.getCell(x, y);
      const isRevealedWithNeighbors = gameCell &&
        gameCell.state === CELL_STATE.REVEALED &&
        gameCell.neighbors > 0;

      if (e.button === 0 && isRevealedWithNeighbors) {
        // Single left click on revealed digit - chord
        this.handleCellChord(x, y);
      } else if (e.button === 0) {
        // Single left click on other cell - reveal
        this.handleCellReveal(x, y);
      } else if (e.button === 2) {
        this.handleCellFlag(x, y);
      }

      this.clearCellPress(x, y);
      this.clearBoardPressing();
    }

    // Clear gesture only when both buttons released
    if (!this.leftPressed && !this.rightPressed) {
      this.chordAnchor = null;
      this.chordHandled = false;
      this.chordGestureActive = false;
      if (this.faceState === 'surprised') {
        this.updateGameStateUI();
      }
    }
  }

  /**
   * Подсветка соседей для chording
   * Uses classList.add('pressing') instead of inline boxShadow
   * Previews ALL CLOSED/QUESTIONED neighbors regardless flag count
   */
  highlightChordNeighbors(x: number, y: number): void {
    const cell = this.game.getCell(x, y);
    if (!cell || cell.state !== CELL_STATE.REVEALED || cell.neighbors === 0) return;

    const neighbors = this.game.getNeighbors(x, y);

    // Preview ALL CLOSED/QUESTIONED neighbors via classList.add('pressing') regardless flag count
    for (const neighbor of neighbors) {
      if (neighbor.state === CELL_STATE.CLOSED || neighbor.state === CELL_STATE.QUESTIONED) {
        const domCell = this.element.cells.get(`${neighbor.x},${neighbor.y}`);
        if (domCell) {
          domCell.classList.add('pressing');
        }
      }
    }
  }

  /**
   * Очистка подсветки соседей - no inline boxShadow
   */
  clearBoardPressing(): void {
    for (const [key, domCell] of this.element.cells.entries()) {
      domCell.classList.remove('pressing');
    }
  }

  /**
   * Обработка касания (touchstart)
   * Sets up gesture tracking; does not perform actions yet
   */
  handleTouchStart(e: TouchEvent): void {
    const cell = closestElement<HTMLButtonElement>(e, '.cell');
    if (!cell) return;

    // Prevent default to avoid ghost clicks
    e.preventDefault();

    const { x, y } = getCellCoordinates(cell);
    this.touchGestureCell = { x, y, element: cell };

    // Подсветка соседей для chording (если нажато 2 пальца)
    // Only highlight if game is not paused (chording is no-op while paused anyway)
    if (this.game.state !== STATE.PAUSED && e.touches.length >= 2) {
      this.highlightChordNeighbors(x, y);
    }
  }

  /**
   * Обработка касания (touchend)
   * Executes the action if no move/cancel occurred
   */
  handleTouchEnd(e: TouchEvent): void {
    // Always clear the pending gesture, even if paused or no cell
    const gesture = this.touchGestureCell;
    this.touchGestureCell = null;
    this.clearBoardPressing();

    // Touch actions are no-ops while paused
    if (this.game.state === STATE.PAUSED) return;

    // If gesture was cancelled by touchmove/touchcancel, do nothing
    if (!gesture) return;

    const cell = closestElement<HTMLButtonElement>(e, '.cell');
    if (!cell) return;

    const { x, y } = getCellCoordinates(cell);

    // Only execute action on the SAME cell that was touched
    if (x === gesture.x && y === gesture.y) {
      this.handleTouchAction(x, y);
    }
  }

  /**
   * Обработка касания (touchcancel)
   * Cancels the pending gesture
   */
  handleTouchCancel(_e: TouchEvent): void {
    // Clear touch gesture state
    this.touchGestureCell = null;
    this.clearBoardPressing();
  }

  /**
   * Обработка касания (touchmove)
   * Cancels the pending gesture to prevent ghost clicks
   */
  handleTouchMove(_e: TouchEvent): void {
    // Clear touch gesture state
    this.touchGestureCell = null;
    this.clearBoardPressing();
  }

  /**
   * Обработка клика по ячейке (раскрытие)
   */
  handleCellReveal(x: number, y: number): void {
    const result = this.game.reveal(x, y);

    // Обновляем раскрытые клетки
    this.updateBoard(result.cells);

    // Если терминальное состояние (win/lose), обновляем всё и ставим соответствующее лицо
    if (result.result === 'terminal' || this.game.state === STATE.WON || this.game.state === STATE.LOST) {
      this.updateAllCells();

    }

    this.updateCounters();
    this.updateGameStateUI();
  }

  /**
   * Обработка действия касания по ячейке
   * Выполняет chording для раскрытых цифр, иначе действие в зависимости от режима
   */
  handleTouchAction(x: number, y: number): void {
    // Touch actions are no-ops while paused
    if (this.game.state === STATE.PAUSED) return;

    const cell = this.game.getCell(x, y);
    if (!cell) return;

    // A tap on a revealed cell with neighbors always performs chording
    if (cell.state === CELL_STATE.REVEALED && cell.neighbors > 0) {
      this.handleCellChord(x, y);
      return;
    }

    // Otherwise, perform the action based on selected touch mode
    switch (this.touchMode) {
      case 'flag':
        this.handleTouchCellFlag(x, y);
        break;
      case 'question':
        this.handleTouchCellQuestion(x, y);
        break;
      case 'click':
        this.handleCellReveal(x, y);
        break;
    }
  }

  /**
   * Обработка клика по ячейке (флаг) - mouse right-click uses cycleFlag
   * Cycles CLOSED -> FLAGGED -> QUESTIONED -> CLOSED
   */
  handleMouseCellFlag(x: number, y: number): void {
    const result = this.game.cycleFlag(x, y);

    if (result.flagsChanged) {
      const cell = this.element.cells.get(`${x},${y}`);
      const gameCell = this.game.getCell(x, y);
      if (cell && gameCell) {
        this.updateCell(cell, gameCell);
      }
      this.updateCounters();
    }
  }

  /**
   * Обработка касания по ячейке (флаг) - uses applyCellMarker for exact toggle
   * Replaces question with flag, toggles off when flag is already set
   */
  handleTouchCellFlag(x: number, y: number): void {
    const result = this.game.applyCellMarker(x, y, 'flag');

    if (result.cellChanged) {
      const cell = this.element.cells.get(`${x},${y}`);
      const gameCell = this.game.getCell(x, y);
      if (cell && gameCell) {
        this.updateCell(cell, gameCell);
      }
      if (result.flagCountChanged) {
        this.updateCounters();
      }
    }
  }

  /**
   * Обработка касания по ячейке (вопрос) - uses applyCellMarker for exact toggle
   * Replaces flag with question, toggles off when question is already set
   */
  handleTouchCellQuestion(x: number, y: number): void {
    const result = this.game.applyCellMarker(x, y, 'question');

    if (result.cellChanged) {
      const cell = this.element.cells.get(`${x},${y}`);
      const gameCell = this.game.getCell(x, y);
      if (cell && gameCell) {
        this.updateCell(cell, gameCell);
      }
      if (result.flagCountChanged) {
        this.updateCounters();
      }
    }
  }

  /**
   * Обработка клика по ячейке (флаг) - mouse right-click uses cycleFlag
   * Cycles CLOSED -> FLAGGED -> QUESTIONED -> CLOSED
   */
  handleCellFlag(x: number, y: number): void {
    this.handleMouseCellFlag(x, y);
  }

  /**
   * Обработка chording (одновременный клик или клик по цифре)
   */
  handleCellChord(x: number, y: number): void {
    const result = this.game.chord(x, y);
    this.updateBoard(result.cells);

    if (result.result === 'terminal' || this.game.state === STATE.WON || this.game.state === STATE.LOST) {
      this.updateAllCells();

    }

    this.updateCounters();
    this.updateGameStateUI();
  }

  /**
   * Установка режима касания
   * @param mode - 'question', 'flag', или 'click'
   */
  setTouchMode(mode: TouchMode): void {
    this.touchMode = mode;
    this.updateTouchModeUI();
  }

  /**
   * Обновление UI для режимов касания
   */
  updateTouchModeUI(): void {
    for (const [mode, button] of this.element.touchModeButtons.entries()) {
      const isPressed = mode === this.touchMode;
      button.setAttribute('aria-pressed', isPressed ? 'true' : 'false');
    }
  }

  /**
   * Обновление состояния ячейки на экране
   * @param {HTMLElement} cell
   * @param {Object} gameCell
   */
  updateCell(cell: HTMLButtonElement, gameCell: Cell): void {
    cell.className = 'cell';

    if (gameCell.state === CELL_STATE.REVEALED) {
      cell.classList.add('revealed');
      cell.classList.remove('flagged', 'questioned');

      if (gameCell.isMine) {
        cell.classList.add('mine');
        if (gameCell.exploded) {
          cell.classList.add('exploded');
        }
        // wrongFlag проверяем независимо
        if (gameCell.wrongFlag) {
          cell.classList.add('wrong-flag');
        }
      } else if (gameCell.neighbors > 0) {
        cell.classList.add(`digit-${gameCell.neighbors}`);
        cell.textContent = String(gameCell.neighbors);
      } else {
        cell.textContent = '';
      }
    } else if (gameCell.state === CELL_STATE.FLAGGED) {
      cell.classList.add('flagged');
      cell.textContent = '';
      // wrongFlag дляFLAGGED клетки
      if (gameCell.wrongFlag) {
        cell.classList.add('wrong-flag');
      }
    } else if (gameCell.state === CELL_STATE.QUESTIONED) {
      cell.classList.add('questioned');
      cell.textContent = '';
    } else {
      cell.textContent = '';
    }

    cell.setAttribute('aria-label', `Клетка ${gameCell.x + 1},${gameCell.y + 1}, ${this.getCellStatus(gameCell)}`);
  }

  /**
   * Обработка клика по кнопке выбора режима касания
   */
  handleTouchModeClick(mode: TouchMode): void {
    this.setTouchMode(mode);
  }

  /**
   * Получение статуса ячейки для aria-label
   */
  getCellStatus(cell: Cell): string {
    if (cell.state === CELL_STATE.REVEALED) {
      if (cell.isMine) return 'мина';
      if (cell.neighbors > 0) return `открыта, ${cell.neighbors}`;
      return 'открыта, пустая';
    }
    if (cell.state === CELL_STATE.FLAGGED) return 'флаг';
    if (cell.state === CELL_STATE.QUESTIONED) return 'вопрос';
    return 'закрыта';
  }

  /**
   * Обновление всех раскрытых ячеек
   */
  updateBoard(revealedCells: readonly Cell[]): void {
    for (const cell of revealedCells) {
      const domCell = this.element.cells.get(`${cell.x},${cell.y}`);
      if (domCell) {
        this.updateCell(domCell, cell);
      }
    }
  }

  /**
   * Обновление всех клеток (при win/lose)
   */
  updateAllCells(): void {
    for (let y = 0; y < this.boardHeight; y++) {
      for (let x = 0; x < this.boardWidth; x++) {
        const cell = this.game.getCell(x, y);
        const domCell = this.element.cells.get(`${x},${y}`);
        if (domCell && cell) {
          this.updateCell(domCell, cell);
        }
      }
    }
  }

  /**
   * Обновление счётчиков
   */
  updateCounters(): void {
    const minesLeft = this.game.totalMines - this.game.flags;
    this.updateLedDisplay(this.element.mineCountDisplay, minesLeft);
    this.updateLedDisplay(this.element.timerDisplay, this.game.timer);
  }

  /**
   * Обновление LED-дисплея
   */
  updateLedDisplay(display: HTMLDivElement, value: number): void {
    const formatted = formatLedNumber(value);
    if (display.dataset.value !== formatted) {
      display.dataset.value = formatted;
      display.innerHTML = this.renderSevenSegment(formatted);
    }
  }

  /**
   * Обновление состояния кнопки-лица
   */
  setFaceState(state: FaceState, btn: HTMLButtonElement = this.element.faceBtn): void {
    this.faceState = state;

    // Generate SVG icon for each face state
    const svgIcon = this.getFaceSvg(state);
    if (btn) {
      btn.innerHTML = svgIcon;
      btn.className = `face-button face-${state}`;
      btn.setAttribute('aria-label', `Лицо: ${this.getFaceDescription(state)}`);
    }
  }

  /**
   * Синхронизирует кнопку паузы и слой, скрывающий игровое поле.
   */
  updateGameStateUI(): void {
    const paused = this.game.state === STATE.PAUSED;
    this.element.pauseOverlay.hidden = !paused;
    this.element.pauseOverlay.setAttribute('aria-hidden', String(!paused));
    this.element.board.inert = paused;
    this.element.board.setAttribute('aria-hidden', String(paused));

    const button = this.element.faceBtn;
    button.disabled = false;
    button.removeAttribute('aria-disabled');
    button.removeAttribute('aria-pressed');

    switch (this.game.state) {
      case STATE.READY:
        this.setFaceState('normal');
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
        button.setAttribute('aria-label', 'Пауза доступна после начала игры');
        button.setAttribute('title', 'Пауза доступна после начала игры');
        break;
      case STATE.RUNNING:
        this.setFaceState('pause');
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-label', 'Приостановить игру');
        button.setAttribute('title', 'Приостановить игру');
        break;
      case STATE.PAUSED:
        this.setFaceState('resume');
        button.setAttribute('aria-pressed', 'true');
        button.setAttribute('aria-label', 'Продолжить игру');
        button.setAttribute('title', 'Продолжить игру');
        break;
      case STATE.WON:
        this.setFaceState('won');
        button.setAttribute('aria-label', 'Начать новую игру после победы');
        button.setAttribute('title', 'Начать новую игру');
        break;
      case STATE.LOST:
        this.setFaceState('dead');
        button.setAttribute('aria-label', 'Начать новую игру после поражения');
        button.setAttribute('title', 'Начать новую игру');
        break;
    }
  }

  /**
   * Generate SVG icon for face state
   * @param {string} state
   * @returns {string}
   */
  getFaceSvg(state: string): string {
    // Win95-style face icons using SVG
    switch (state) {
      case 'normal':
        return '<svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="gold"/><circle cx="11" cy="12" r="2" fill="black"/><circle cx="21" cy="12" r="2" fill="black"/><path d="M10 20 Q16 24 22 20" stroke="black" stroke-width="2" fill="none"/></svg>';
      case 'surprised':
        return '<svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="gold"/><circle cx="11" cy="12" r="2" fill="black"/><circle cx="21" cy="12" r="2" fill="black"/><circle cx="16" cy="20" r="3" fill="black"/></svg>';
      case 'dead':
        // Dead: X-eyes with stroke-width 3, explicit sad mouth on gold face
        return '<svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="gold"/><path d="M10 8 L14 12 M14 8 L10 12" stroke="black" stroke-width="3" fill="none"/><path d="M22 8 L18 12 M18 8 L22 12" stroke="black" stroke-width="3" fill="none"/><path d="M10 24 Q16 20 22 24" stroke="black" stroke-width="3" fill="none"/></svg>';
      case 'won':
        // Won: Win95-style pixel art sunglasses with stepped lenses, bridge, temples, pixel smile
        return '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" shape-rendering="crispEdges"><circle cx="12" cy="12" r="10" fill="gold" stroke="black" stroke-width="1"/><path d="M4 7H10V10L9 12H6L5 10H4Z" fill="black"/><path d="M14 7H20V10L19 12H16L15 10H14Z" fill="black"/><path d="M10 8H14V9H10Z" fill="black"/><path d="M3 7H4V8H3Z" fill="black"/><path d="M20 7H21V8H20Z" fill="black"/><path d="M7 16H8V17H10V18H14V17H16V16H17V18H16V19H14V20H10V19H8V18H7Z" fill="black"/></svg>';
      case 'pause':
        return '<svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true" shape-rendering="crispEdges"><circle cx="16" cy="16" r="14" fill="gold"/><rect x="10" y="8" width="4" height="16" fill="black"/><rect x="18" y="8" width="4" height="16" fill="black"/></svg>';
      case 'resume':
        return '<svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true" shape-rendering="crispEdges"><circle cx="16" cy="16" r="14" fill="gold"/><path d="M12 8 L24 16 L12 24 Z" fill="black"/></svg>';
      default:
        return '<svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="gold"/><circle cx="11" cy="12" r="2" fill="black"/><circle cx="21" cy="12" r="2" fill="black"/><path d="M10 20 Q16 24 22 20" stroke="black" stroke-width="2" fill="none"/></svg>';
    }
  }

  /**
   * Описание состояния лица
   */
  getFaceDescription(state: string): string {
    const descriptions: Record<FaceState, string> = {
      normal: 'Нормальное',
      surprised: 'Удивлённое',
      dead: 'Поражение',
      won: 'Победа',
      pause: 'Пауза',
      resume: 'Продолжить'
    };
    if (state === 'normal' || state === 'surprised' || state === 'dead' || state === 'won'
      || state === 'pause' || state === 'resume') {
      return descriptions[state];
    }
    return 'Нормальное';
  }

  /**
   * Выделение ячейки при нажатии
   */
  highlightCellPress(x: number, y: number, pressed: boolean): void {
    const cell = this.element.cells.get(`${x},${y}`);
    if (cell) {
      if (pressed) {
        cell.classList.add('pressing');
        cell.setAttribute('aria-pressed', 'true');
      } else {
        cell.classList.remove('pressing');
        cell.setAttribute('aria-pressed', 'false');
      }
    }
  }

  /**
   * Очистка выделения ячейки
   */
  clearCellPress(x: number, y: number): void {
    this.highlightCellPress(x, y, false);
  }

  /**
   * Сброс игры
   */
  resetGame(): void {
    this.game.reset();
    this.updateAllCells();
    this.updateCounters();
    this.updateGameStateUI();
  }

  /**
   * Установка сложности
   */
  setDifficulty(difficulty: string): void {
    let config;

    if (difficulty === 'beginner') {
      config = DIFFICULTY.BEGINNER;
    } else if (difficulty === 'intermediate') {
      config = DIFFICULTY.INTERMEDIATE;
    } else if (difficulty === 'expert') {
      config = DIFFICULTY.EXPERT;
    } else {
      return;
    }

    this.boardWidth = config.width;
    this.boardHeight = config.height;
    this.game.setConfig(config);
    // Обновляем DOM и CSS
    this.updateAll();
    this.updateCounters();
  }

  /**
   * Обновление всех элементов UI
   */
  updateAll(): void {
    this.createBoardCells();
    this.updateCounters();
    this.updateGameStateUI();

    // Обновляем размеры сетки
    this.element.board.style.setProperty('--board-width', String(this.boardWidth));
    this.element.board.style.setProperty('--board-height', String(this.boardHeight));
  }

  /**
   * Обновление галочек сложности
   */
  updateDifficultyCheckmarks(currentDifficulty: string): void {
    for (const [diff, el] of Object.entries(this.element.difficultyCheckmarks)) {
      if (diff === currentDifficulty) {
        el.classList.add('checked');
      } else {
        el.classList.remove('checked');
      }
    }
  }

  /**
   * Открытие диалога настройки custom
   */
  openCustomDialog(): void {
    const current = this.game.getConfig();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';

    modal.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="custom-title">
        <div class="modal-header">
          <h2 class="modal-title" id="custom-title">Особый режим</h2>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="custom-width">Ширина (9–30)</label>
            <input type="number" id="custom-width" min="9" max="30" value="${current.width}" required>
          </div>
          <div class="form-group">
            <label for="custom-height">Высота (9–24)</label>
            <input type="number" id="custom-height" min="9" max="24" value="${current.height}" required>
          </div>
          <div class="form-group">
            <label for="custom-mines">Количество мин (10–668)</label>
            <input type="number" id="custom-mines" min="10" max="668" value="${Math.max(10, current.mines)}" required>
          </div>
          <p id="custom-error" style="color: red; font-weight: bold; margin: 8px 0; display: none;"></p>
        </div>
        <div class="modal-footer">
          <button class="button" id="custom-cancel" type="button">Отмена</button>
          <button class="button" id="custom-ok" type="button">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const okBtn = modal.querySelector<HTMLButtonElement>('#custom-ok');
    const cancelBtn = modal.querySelector<HTMLButtonElement>('#custom-cancel');
    const widthInput = modal.querySelector<HTMLInputElement>('#custom-width');
    const heightInput = modal.querySelector<HTMLInputElement>('#custom-height');
    const minesInput = modal.querySelector<HTMLInputElement>('#custom-mines');
    const errorDiv = modal.querySelector<HTMLParagraphElement>('#custom-error');

    if (!okBtn || !cancelBtn || !widthInput || !heightInput || !minesInput || !errorDiv) {
      throw new Error('Не удалось создать элементы диалога настройки');
    }

    // Auto-update min field
    const updateMinMines = () => {
      const w = Number(widthInput.value) || 9;
      const h = Number(heightInput.value) || 9;
      const max = Math.min(668, w * h - 9);
      minesInput.max = String(max);
      const currentMines = Number(minesInput.value) || 10;
      if (currentMines > max) {
        minesInput.value = String(Math.max(10, Math.min(currentMines, max)));
      }
    };

    widthInput.addEventListener('input', updateMinMines);
    heightInput.addEventListener('input', updateMinMines);

    const validate = () => {
      const w = Number(widthInput.value);
      const h = Number(heightInput.value);
      const m = Number(minesInput.value);

      const result = Minesweeper.isValidConfig(w, h, m);

      if (!result.valid) {
        errorDiv.textContent = result.error;
        errorDiv.style.display = 'block';
        okBtn.disabled = true;
        return false;
      }

      errorDiv.style.display = 'none';
      okBtn.disabled = false;
      return true;
    };

    widthInput.addEventListener('change', validate);
    heightInput.addEventListener('change', validate);
    minesInput.addEventListener('change', validate);

    validate();
    okBtn.focus();

    const finish = (success: boolean): void => {
      modal.remove();
      if (success) {
        const w = Number(widthInput.value);
        const h = Number(heightInput.value);
        const m = Number(minesInput.value);
        const config = { width: w, height: h, mines: m };

        this.boardWidth = w;
        this.boardHeight = h;
        this.game.setConfig(config);
        this.updateAll();
        this.updateDifficultyCheckmarks(getStandardDifficulty(config) || 'custom');
      }
    };

    okBtn.addEventListener('click', () => {
      if (validate()) {
        finish(true);
      }
    });

    cancelBtn.addEventListener('click', () => finish(false));

    // Enter key
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        finish(false);
      } else if (e.key === 'Enter' && okBtn.disabled === false) {
        if (validate()) {
        finish(true);
        }
      }
    });

    // Initial focus
    setTimeout(() => {
      widthInput.focus();
    }, 10);
  }

  /**
   * Открытие диалога управления
   */
  openControlsDialog(): void {
    this.openInfoDialog('Управление', `
Сапёр - Классическая игра

ОПИСАНИЕ:
Цель игры - раскрыть все клетки без мин. Клетки с цифрами показывают количество мин в соседних клетках.

УПРАВЛЕНИЕ:
1. ЛКМ (щёлкнуть) - Раскрыть клетку
2. ПКМ (щёлкнуть) - Поставить/убрать флаг (цикл: закрыта → флаг → вопрос → закрыта)
3. ЛКМ+ПКМ (одновременно) - Chording (раскрытие по цифре)
4. ЛКМ по раскрытой цифре - Chording
5. F2 - Новая игра

ПАУЗА:
Кнопка-лицо в верхней части управления:
- READY - неактивна (пауза недоступна до начала игры)
- RUNNING - приостанавливает игру, скрывает игровое поле
- PAUSED - возобновляет игру
- WON/LOST - начинает новую игру

ПАНЕЛЬ МАСШТАБИРОВАНИЯ (в заголовке окна):
- кнопки: минус / текущий процент (сброс) / плюс;
- фиксированные уровни: 75% → 100% → 125% → 150% → 175% → 200%;
- центральная кнопка возвращает к 100%;
- масштаб влияет на весь интерфейс;
- масштаб не сохраняется и при перезагрузке страницы сбрасывается на 100%;
- кнопка "+" недоступна на уровне 200%.

ДЛЯ TOUCH-УСТРОЙСТВ:
Панель управления отображается внизу игрового поля (только на тач-экранах):
- Режимы (по умолчанию: Клик): Вопрос / Флаг / Клик
- Выбранный режим сохраняется во время игры
- При касании раскрытой цифры всегда выполняется chording
- Вопрос: закрытая клетка или клетка с флагом становится вопросом; повторное касание клетки с вопросом закрывает её
- Флаг: закрытая клетка или клетка с вопросом становится флагом; повторное касание клетки с флагом закрывает её
    `);
  }

  /**
   * Открытие диалога "О программе"
   */
  openAboutDialog(): void {
    this.openInfoDialog('О программе', `
Сапёр
Версия 1.0.0

Классическая игра Сапёр, реализованная в стиле Windows 95/98.

ОРИГИНАЛ:
Игра Сапёр была впервые выпущена Microsoft в 1990 году как часть пакета Microsoft Plus! для Windows 3.0. Она предназначена для тренировки памяти и логического мышления.

ИСПОЛЬЗОВАННЫЕ ТЕХНОЛОГИИ:
- HTML5
- CSS3 (без CSS-фреймворков)
- TypeScript
- Vite
- Node.js (тесты)
    `);
  }

  /**
   * Открытие информационного диалога
   */
  openInfoDialog(title: string, content: string): void {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';

    modal.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="info-title">
        <div class="modal-header">
          <h2 class="modal-title" id="info-title">${title}</h2>
        </div>
        <div class="modal-body info-content">
          ${content}
        </div>
        <div class="modal-footer">
          <button class="button" id="info-close" type="button">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector<HTMLButtonElement>('#info-close');
    if (!closeBtn) {
      throw new Error('Не удалось создать кнопку закрытия диалога');
    }
    closeBtn.focus();

    const close = () => modal.remove();

    closeBtn.addEventListener('click', close);

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        close();
      }
    });
  }

  /**
   * Запуск интерфейсного обновления (для таймера)
   */
  startUIUpdate(): void {
    this.stopUIUpdate();
    this.updateUI();
  }

  /**
   * Остановка интерфейсного обновления
   */
  stopUIUpdate(): void {
    if (this.timerInterval) {
      cancelAnimationFrame(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Обновление интерфейса
   */
  updateUI(): void {
    if (this.game.state === STATE.RUNNING) {
      this.updateCounters();
    }
    this.timerInterval = requestAnimationFrame(() => {
      this.updateUI();
    });
  }

  /**
   * Закрытие всех меню
   */
  closeAllMenus(): void {
    for (const dropdown of Object.values(this.element.menuDropdowns || {})) {
      dropdown.classList.remove('show');
      dropdown.style.position = '';
      dropdown.style.left = '';
      dropdown.style.top = '';
    }
  }

  /**
   * Update theme menu item label from controller
   * Safe no-op if controller not provided
   */
  updateThemeMenuItemLabel(): void {
    if (this.element.themeMenuItem && this.themeController) {
      this.element.themeMenuItem.textContent = this.themeController.getMenuLabel();
    }
  }

  /**
   * Установка режима из конфигурации
   */
  setDifficultyFromConfig(config: GameConfig): void {
    const standard = getStandardDifficulty(config);
    if (standard) {
      this.setDifficulty(standard);
      this.updateDifficultyCheckmarks(standard);
    } else {
      // Для custom режима обновляем только доску
      this.boardWidth = config.width;
      this.boardHeight = config.height;
      this.game.setConfig(config);
      this.updateAll();
      this.updateDifficultyCheckmarks('custom');
    }
  }

  /**
   * Установка начального режима
   */
  setInitialDifficulty(difficulty: StandardDifficulty): void {
    this.setDifficulty(difficulty);
    this.updateDifficultyCheckmarks(difficulty);
  }
}
