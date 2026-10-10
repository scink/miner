/**
 * UI Module - DOM manipulation and event handling
 */

import { Minesweeper, DIFFICULTY, STATE, CELL_STATE } from './Game.js';
import { formatLedNumber, getDigitColor, getStandardDifficulty } from './utils.js';

export class UI {
  constructor(game) {
    this.game = game;
    this.touchMode = 'reveal'; // 'reveal' or 'flag'
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
    this.longPressTimer = null;
    this.longPressCell = null;
    this.touchLongPressTriggered = false; // prevent second action after long press
    
    this.element = {
      board: null,
      cells: new Map(),
      faceBtn: null,
      timerDisplay: null,
      mineCountDisplay: null,
      menuItems: new Map(),
      touchModeToggle: null,
      menuDropdowns: {},
      themeCheckbox: null,
      difficultyCheckmarks: {}
    };
    
    this.timerInterval = null;
    this.uiUpdateValue = null;
    this.init();
  }

  /**
   * Инициализация UI
   */
  init() {
    this.createDOM();
    this.setupEventListeners();
    this.applyTheme();
    this.startUIUpdate();
  }

  /**
   * Создание DOM-элементов
   */
  createDOM() {
    const container = document.body;
    
    // Main window
    this.element.window = document.createElement('div');
    this.element.window.className = 'window';
    
    // Title bar - Windows 95 style, no gradient, solid blue
    const titleBar = document.createElement('div');
    titleBar.className = 'title-bar';
    titleBar.style.backgroundColor = '#000080';
    titleBar.innerHTML = `
      <span class="title-text">Сапёр</span>
      <div class="window-controls" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    this.element.window.appendChild(titleBar);
    
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
    
    // Game board
    this.element.board = document.createElement('div');
    this.element.board.className = 'board';
    this.element.board.setAttribute('role', 'grid');
    this.element.board.setAttribute('aria-label', 'Игровое поле');
    this.element.board.setAttribute('aria-readonly', 'true');
    this.element.board.style.setProperty('--board-width', this.boardWidth);
    this.element.board.style.setProperty('--board-height', this.boardHeight);
    this.createBoardCells();
    boardArea.appendChild(this.element.board);
    
    // Touch controls
    const touchControls = document.createElement('div');
    touchControls.className = 'touch-controls';
    touchControls.innerHTML = `
      <div class="touch-mode-toggle">
        <input type="radio" name="touch-mode" value="reveal" id="touch-reveal" ${this.touchMode === 'reveal' ? 'checked' : ''}>
        <label for="touch-reveal">Показать</label>
        <input type="radio" name="touch-mode" value="flag" id="touch-flag" ${this.touchMode === 'flag' ? 'checked' : ''}>
        <label for="touch-flag">Флаг</label>
      </div>
      <div class="touch-status" id="touch-status">Долгое нажатие для флага</div>
    `;
    boardArea.appendChild(touchControls);
    this.element.touchModeToggle = touchControls;
    
    this.element.window.appendChild(boardArea);
    container.appendChild(this.element.window);
    
    // Menu dropdowns
    this.createMenuDropdowns();
  }

  /**
   * Создание меню
   */
  createMenu() {
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
  createMenuDropdowns() {
    // Game menu
    const gameMenu = document.createElement('div');
    gameMenu.className = 'menu-dropdown';
    gameMenu.id = 'menu-game-dropdown';
    gameMenu.setAttribute('role', 'menu');
    
    const gameItems = [
      { label: 'Новая игра', action: 'new', shortcut: 'F2', menuId: 'menu-game-dropdown' },
      { type: 'separator' },
      { label: 'Новичок', action: 'difficulty', value: 'beginner', difficulty: DIFFICULTY.BEGINNER, menuId: 'menu-game-dropdown' },
      { label: 'Любитель', action: 'difficulty', value: 'intermediate', difficulty: DIFFICULTY.INTERMEDIATE, menuId: 'menu-game-dropdown' },
      { label: 'Профессионал', action: 'difficulty', value: 'expert', difficulty: DIFFICULTY.EXPERT, menuId: 'menu-game-dropdown' },
      { label: 'Особый...', action: 'custom', value: 'custom', isDifficulty: true, menuId: 'menu-game-dropdown' },
      { type: 'separator' },
      { label: 'Тёмная тема', action: 'theme', checkbox: true, menuId: 'menu-game-dropdown' }
    ];
    
    for (const item of gameItems) {
      if (item.type === 'separator') {
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
      
      if (item.checkbox) {
        el.classList.add('has-checkbox');
        this.element.themeCheckbox = el;
      } else if (item.difficulty || item.isDifficulty) {
        el.classList.add('has-checkmark');
        this.element.difficultyCheckmarks[item.value] = el;
        if (item.value === 'beginner') {
          el.classList.add('checked');
        }
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
  createLedDisplay(value) {
    const display = document.createElement('div');
    display.className = 'led-display';
    display.setAttribute('role', 'status');
    display.setAttribute('aria-live', 'polite');
    display.dataset.value = value;
    
    const formatted = formatLedNumber(value);
    display.innerHTML = this.renderSevenSegment(formatted);
    return display;
  }

  /**
   * Рендер семисегментного отображения
   * @param {string} value
   * @returns {string}
   */
  renderSevenSegment(value) {
    const segments = {
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
  createFaceButton() {
    const btn = document.createElement('button');
    btn.className = 'face-button';
    btn.setAttribute('aria-label', 'Начать новую игру');
    btn.setAttribute('tabindex', '-1');
    // Generate SVG for normal state without touching DOM
    btn.innerHTML = this.getFaceSvg('normal');
    return btn;
  }

  /**
   * Создание ячеек игрового поля
   */
  createBoardCells() {
    this.element.board.innerHTML = '';
    this.element.cells.clear();
    
    for (let y = 0; y < this.boardHeight; y++) {
      for (let x = 0; x < this.boardWidth; x++) {
        const cell = document.createElement('button');
        cell.className = 'cell';
        cell.dataset.x = x;
        cell.dataset.y = y;
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
  setupEventListeners() {
    // Face button
    this.element.faceBtn.addEventListener('click', () => this.handleFaceClick());
    // Note: removed mousedown mousedown handler that changed face state.
    // CSS :active handles visual feedback; only click triggers resetGame().
    
    // Global mouseup - handle cleanup for drag-out outside board
    document.addEventListener('mouseup', (e) => {
      // If mouseup is on a cell, board handler already processed it - do nothing
      if (e.target.closest('.cell')) return;
      
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
          this.setFaceState('normal');
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
    this.setupTouchListeners();
  }

  /**
   * Настройка обработчиков меню
   */
  setupMenuListeners() {
    // Menu items in menubar
    const menuItems = this.element.menubar.querySelectorAll('.menu-item');
    for (const item of menuItems) {
      item.addEventListener('click', (e) => this.handleMenuClick(e));
    }
    
    // Dropdown items
    const dropdownItems = document.querySelectorAll('.menu-dropdown .menu-item');
    for (const item of dropdownItems) {
      item.addEventListener('click', (e) => this.handleDropdownClick(e));
    }
    
    // Close menus on click outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.menubar') && !e.target.closest('.menu-dropdown')) {
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

  /**
   * Настройка touch-интерфейса
   */
  setupTouchListeners() {
    const touchModeRadios = this.element.touchModeToggle.querySelectorAll('input[name="touch-mode"]');
    for (const radio of touchModeRadios) {
      radio.addEventListener('change', (e) => {
        this.touchMode = e.target.value;
      });
    }
  }

  /**
   * Обработка клика по кнопке-лицу
   */
  handleFaceClick() {
    this.resetGame();
  }

  /**
   * Обработка клика по элементу меню (открытие выпадающего меню)
   * @param {MouseEvent} e
   */
  handleMenuClick(e) {
    // Find the closest .menu-item with dataset.menuId
    const item = e.target.closest('.menu-item');
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
  handleDropdownClick(e) {
    // Find the item and action
    const item = e.target.closest('.menu-item');
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
        const isChecked = item.classList.contains('checked');
        this.toggleTheme(!isChecked);
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
  handleBoardMouseDown(e) {
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
    
    const cell = e.target.closest('.cell');
    if (cell) {
      const x = parseInt(cell.dataset.x);
      const y = parseInt(cell.dataset.y);
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
  handleBoardMouseUp(e) {
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
          this.setFaceState('normal');
        }
      }
      return;
    }
    
    // Regular click processing
    const cell = e.target.closest('.cell');
    if (cell) {
      const x = parseInt(cell.dataset.x);
      const y = parseInt(cell.dataset.y);
      
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
        this.setFaceState('normal');
      }
    }
  }

  /**
   * Подсветка соседей для chording
   * Uses classList.add('pressing') instead of inline boxShadow
   * Previews ALL CLOSED/QUESTIONED neighbors regardless flag count
   */
  highlightChordNeighbors(x, y) {
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
  clearBoardPressing() {
    for (const [key, domCell] of this.element.cells.entries()) {
      domCell.classList.remove('pressing');
    }
  }

  /**
   * Очистка long press timer и состояния
   */
  clearTouchState() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressCell = null;
    // NOTE: do NOT clear touchLongPressTriggered - it's preserved for touchend check
  }

  /**
   * Обработка касания (touchstart)
   */
  handleTouchStart(e) {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    
    // Prevent default to avoid ghost clicks
    e.preventDefault();
    
    const x = parseInt(cell.dataset.x);
    const y = parseInt(cell.dataset.y);
    
    // Start long press timer for flag
    this.longPressCell = { x, y, element: cell };
    this.touchLongPressTriggered = false;
    this.longPressTimer = setTimeout(() => {
      if (this.longPressCell && this.longPressCell.element === cell) {
        this.touchLongPressTriggered = true;
        this.clearTouchState();
        this.handleCellFlag(x, y);
      }
    }, 500);
    
    // Подсветка соседей для chording (если нажато 2 пальца)
    if (e.touches.length >= 2) {
      this.highlightChordNeighbors(x, y);
    }
  }

  /**
   * Обработка завершения касания (touchend)
   */
  handleTouchEnd(e) {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    
    const x = parseInt(cell.dataset.x);
    const y = parseInt(cell.dataset.y);
    
    // Save wasLong BEFORE clearTouchState
    const wasLong = this.touchLongPressTriggered;
    
    // Clear long press timer and reset cell reference
    this.clearTouchState();
    
    // If long press was triggered, only reset and return
    if (wasLong) {
      this.touchLongPressTriggered = false;
      return;
    }
    
    // Если это не был long press, выполнить действие в зависимости от режима
    if (this.touchMode === 'flag') {
      this.handleCellFlag(x, y);
    } else {
      this.handleCellReveal(x, y);
    }
    
    // Clear touchLongPressTriggered after regular action
    this.touchLongPressTriggered = false;
  }

  /**
   * Обработка касания (touchcancel)
   * ONLY clears timeout, longPressCell=null and pressed preview; never reveal/flag
   */
  handleTouchCancel(e) {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressCell = null;
    this.touchLongPressTriggered = false;
    this.clearBoardPressing();
  }

  /**
   * Обработка касания (touchmove) - same as touchcancel
   */
  handleTouchMove(e) {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressCell = null;
    this.touchLongPressTriggered = false;
    this.clearBoardPressing();
  }

  /**
   * Обработка клика по ячейке (раскрытие)
   */
  handleCellReveal(x, y) {
    const result = this.game.reveal(x, y);
    
    // Обновляем раскрытые клетки
    this.updateBoard(result.cells);
    
    // Если терминальное состояние (win/lose), обновляем всё и ставим соответствующее лицо
    if (result.result === 'terminal' || this.game.state === STATE.WON || this.game.state === STATE.LOST) {
      this.updateAllCells();
      
      if (this.game.state === STATE.WON) {
        this.setFaceState('won');
      } else if (this.game.state === STATE.LOST) {
        this.setFaceState('dead');
      }
    } else if (this.game.state === STATE.RUNNING && result.result === 'ok') {
      this.setFaceState('normal');
    }
    
    this.updateCounters();
  }

  /**
   * Обработка клика по ячейке (флаг)
   */
  handleCellFlag(x, y) {
    const result = this.game.cycleFlag(x, y);
    
    if (result.flagsChanged) {
      const cell = this.element.cells.get(`${x},${y}`);
      if (cell) {
        this.updateCell(cell, this.game.getCell(x, y));
      }
      this.updateCounters();
    }
  }

  /**
   * Обработка chording (одновременный клик или клик по цифре)
   */
  handleCellChord(x, y) {
    const result = this.game.chord(x, y);
    this.updateBoard(result.cells);
    
    if (result.result === 'terminal' || this.game.state === STATE.WON || this.game.state === STATE.LOST) {
      this.updateAllCells();
      
      if (this.game.state === STATE.WON) {
        this.setFaceState('won');
      } else if (this.game.state === STATE.LOST) {
        this.setFaceState('dead');
      }
    }
    
    this.updateCounters();
  }

  /**
   * Обновление состояния ячейки на экране
   * @param {HTMLElement} cell
   * @param {Object} gameCell
   */
  updateCell(cell, gameCell) {
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
        cell.textContent = gameCell.neighbors;
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
   * Получение статуса ячейки для aria-label
   */
  getCellStatus(cell) {
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
  updateBoard(revealedCells) {
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
  updateAllCells() {
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
  updateCounters() {
    const minesLeft = this.game.totalMines - this.game.flags;
    this.updateLedDisplay(this.element.mineCountDisplay, minesLeft);
    this.updateLedDisplay(this.element.timerDisplay, this.game.timer);
  }

  /**
   * Обновление LED-дисплея
   */
  updateLedDisplay(display, value) {
    const formatted = formatLedNumber(value);
    if (display.dataset.value !== formatted) {
      display.dataset.value = formatted;
      display.innerHTML = this.renderSevenSegment(formatted);
    }
  }

  /**
   * Обновление состояния кнопки-лица
   */
  setFaceState(state, btn = this.element.faceBtn) {
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
   * Generate SVG icon for face state
   * @param {string} state
   * @returns {string}
   */
  getFaceSvg(state) {
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
        // Won: Win95-style sunglasses with two lenses, bridge, and smile on gold face
        return '<svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true" shape-rendering="crispEdges"><circle cx="16" cy="16" r="14" fill="gold"/><path d="M7 9 L12 9 L12 13 L7 13 Z" fill="black"/><path d="M13 10 L19 10" stroke="black" stroke-width="2" fill="none"/><path d="M20 9 L25 9 L25 13 L20 13 Z" fill="black"/><path d="M9 22 Q16 27 23 22" stroke="black" stroke-width="2" fill="none"/></svg>';
      default:
        return '<svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="gold"/><circle cx="11" cy="12" r="2" fill="black"/><circle cx="21" cy="12" r="2" fill="black"/><path d="M10 20 Q16 24 22 20" stroke="black" stroke-width="2" fill="none"/></svg>';
    }
  }

  /**
   * Описание состояния лица
   */
  getFaceDescription(state) {
    const descriptions = {
      normal: 'Нормальное',
      surprised: 'Удивлённое',
      dead: 'Поражение',
      won: 'Победа'
    };
    return descriptions[state] || 'Нормальное';
  }

  /**
   * Выделение ячейки при нажатии
   */
  highlightCellPress(x, y, pressed) {
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
  clearCellPress(x, y) {
    this.highlightCellPress(x, y, false);
  }

  /**
   * Сброс игры
   */
  resetGame() {
    this.game.reset();
    this.updateAllCells();
    this.updateCounters();
    this.setFaceState('normal');
  }

  /**
   * Установка сложности
   */
  setDifficulty(difficulty) {
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
    this.setFaceState('normal');
  }

  /**
   * Обновление всех элементов UI
   */
  updateAll() {
    this.createBoardCells();
    this.updateCounters();
    this.setFaceState('normal');
    
    // Обновляем размеры сетки
    this.element.board.style.setProperty('--board-width', this.boardWidth);
    this.element.board.style.setProperty('--board-height', this.boardHeight);
  }

  /**
   * Обновление галочек сложности
   */
  updateDifficultyCheckmarks(currentDifficulty) {
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
  openCustomDialog() {
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
    
    const okBtn = modal.querySelector('#custom-ok');
    const cancelBtn = modal.querySelector('#custom-cancel');
    const widthInput = modal.querySelector('#custom-width');
    const heightInput = modal.querySelector('#custom-height');
    const minesInput = modal.querySelector('#custom-mines');
    const errorDiv = modal.querySelector('#custom-error');
    
    // Auto-update min field
    const updateMinMines = () => {
      const w = Number(widthInput.value) || 9;
      const h = Number(heightInput.value) || 9;
      const max = Math.min(668, w * h - 9);
      minesInput.max = max;
      const currentMines = Number(minesInput.value) || 10;
      if (currentMines > max) {
        minesInput.value = Math.max(10, Math.min(currentMines, max));
      }
    };
    
    widthInput.addEventListener('input', updateMinMines);
    heightInput.addEventListener('input', updateMinMines);
    
    const validate = () => {
      const w = Number(widthInput.value);
      const h = Number(heightInput.value);
      const m = Number(minesInput.value);
      
      const result = this.game.constructor.isValidConfig(w, h, m);
      
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
    
    const finish = (success) => {
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
        this.setFaceState('normal');
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
  openControlsDialog() {
    this.openInfoDialog('Управление', `
Сапёр - Классическая игра

ОПИСАНИЕ:
Цель игры - раскрыть все клетки без мин. Клетки с цифрами показывают количество мин в соседних клетках.

УПРАВЛЕНИЕ:
1. ЛКМ (щёлкнуть) - Раскрыть клетку
2. ПКМ (щёлкнуть) - Поставить/убрать флаг
3. ЛКМ+ПКМ (одновременно) - Chording (раскрытие по цифре)
4. ЛКМ по раскрытой цифре - Chording

Горячие клавиши:
F2 - Новая игра
F - Поставить флаг (на фокусированной клетке)
Стрелки - Перемещение по полю
Enter/Space - Раскрыть

ДЛЯ TOUCH-УСТРОЙСТВ:
- Режим по умолчанию: касание для раскрытия
- Режим флага: переключить в меню или долгое нажатие (500мс)
    `);
  }

  /**
   * Открытие диалога "О программе"
   */
  openAboutDialog() {
    this.openInfoDialog('О программе', `
Сапёр
Версия 1.0.0

Классическая игра Сапёр, реализованная в стиле Windows 95/98.

ОРИГИНАЛ:
Игра Сапёр была впервые выпущена Microsoft в 1990 году как часть пакета Microsoft Plus! для Windows 3.0. Она предназначена для тренировки памяти и логического мышления.

ИСПОЛЬЗОВАННЫЕ ТЕХНОЛОГИИ:
- HTML5
- CSS3 (без CSS-фреймворков)
- JavaScript (ES2021+)
- Node.js (тесты)
    `);
  }

  /**
   * Открытие информационного диалога
   */
  openInfoDialog(title, content) {
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
    
    const closeBtn = modal.querySelector('#info-close');
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
  startUIUpdate() {
    this.stopUIUpdate();
    this.updateUI();
  }

  /**
   * Остановка интерфейсного обновления
   */
  stopUIUpdate() {
    if (this.timerInterval) {
      cancelAnimationFrame(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Обновление интерфейса
   */
  updateUI() {
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
  closeAllMenus() {
    for (const dropdown of Object.values(this.element.menuDropdowns || {})) {
      dropdown.classList.remove('show');
      dropdown.style.position = '';
      dropdown.style.left = '';
      dropdown.style.top = '';
    }
  }

  /**
   * Переключение темы
   */
  toggleTheme(isDark) {
    try {
      if (isDark) {
        document.documentElement.classList.add('dark-theme');
        localStorage.setItem('minesweeper-theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark-theme');
        localStorage.setItem('minesweeper-theme', 'light');
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    
    // Обновить чекбокс в меню
    if (this.element.themeCheckbox) {
      if (isDark) {
        this.element.themeCheckbox.classList.add('checked');
      } else {
        this.element.themeCheckbox.classList.remove('checked');
      }
    }
  }

  /**
   * Применение сохранённой темы
   */
  applyTheme() {
    try {
      const savedTheme = localStorage.getItem('minesweeper-theme');
      const isDark = savedTheme === 'dark';
      this.toggleTheme(isDark);
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  /**
   * Установка режима из конфигурации
   */
  setDifficultyFromConfig(config) {
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
  setInitialDifficulty(difficulty) {
    this.setDifficulty(difficulty);
    this.updateDifficultyCheckmarks(difficulty);
  }
}
