/**
 * @name UniSoundMiniPlayer
 * @author iamvany20
 * @authorId 922703097522962432
 * @description Adds a real-time, interactive and minimal UniSound mini-player to the main account panel.
 * @version 1.0.1
 * @source https://github.com/iamvany30/unisound-desktop
 * @updateUrl https://raw.githubusercontent.com/iamvany30/unisound-miniplayer-plugin-bd/refs/heads/main/UniSoundMiniPlayer.plugin.js
 * @license MIT
 */

module.exports = class UniSoundMiniPlayer {
    constructor() {
        this.playerState = { playing: false, track: null };
        this.connectionStatus = 'disconnected';
        this.socket = null;
        this.reconnectInterval = null;
        this.cssId = "unisound-mini-player-styles";
        this.artworkCache = new Map();
        this.settings = {
            showPlayer: true,
            playerPosition: 'above',
            showTrackControls: true,
        };
        this.retryAttempts = 0;

        this.handleEvents = this.handleEvents.bind(this);
        this.findAndConnect = this.findAndConnect.bind(this);
        this.accountPanelParentSelector = 'section[class^="panels_"]';
    }

    log(message, ...data) { console.log("%c[UniSound Player]", "color: #3b82f6; font-weight: bold;", message, ...data); }
    error(message, ...data) { console.error("%c[UniSound Player]", "color: #f43f5e; font-weight: bold;", message, ...data); }

    start() {
        this.log("Plugin starting...");
        Object.assign(this.settings, BdApi.Data.load("UniSoundMiniPlayer", "settings"));
        this.injectCSS();
        document.addEventListener('click', this.handleEvents, true);
        this.retryAttempts = 0;
        this.findAndConnect();
        this.log("Plugin started successfully.");
    }

    stop() {
        this.log("Plugin stopping...");
        document.removeEventListener('click', this.handleEvents, true);
        this.disconnect();
        BdApi.DOM.removeStyle(this.cssId);
        this.ensureAllPlayersRemoved();
        this.artworkCache.clear();
        this.log("Plugin stopped.");
    }

    getSettingsPanel() {
        const panel = document.createElement("form");
        panel.className = "usmp-settings";
        panel.innerHTML = `
            <style>
                .usmp-settings { padding: 20px; }
                .usmp-settings * { box-sizing: border-box; }
                .usmp-setting-item { display: flex; justify-content: space-between; align-items: center; }
                .usmp-setting-info .title { color: var(--header-primary); font-size: 16px; font-weight: 600; margin-bottom: 4px; }
                .usmp-setting-info .note { color: var(--header-secondary); font-size: 12px; }
                .usmp-divider { border-top: 1px solid var(--background-modifier-accent); margin: 16px 0; }

                /* Toggle Switch */
                .usmp-switch { position: relative; display: inline-block; width: 44px; height: 24px; }
                .usmp-switch input { opacity: 0; width: 0; height: 0; }
                .usmp-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--background-tertiary); transition: .3s; border-radius: 24px; }
                .usmp-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; }
                .usmp-switch input:checked + .usmp-slider { background-color: var(--brand-experiment); }
                .usmp-switch input:checked + .usmp-slider:before { transform: translateX(20px); }

                /* Segmented Control */
                .usmp-segmented-control { display: flex; background-color: var(--background-tertiary); border-radius: 6px; padding: 2px; }
                .usmp-segmented-control label { position: relative; }
                .usmp-segmented-control input { appearance: none; position: absolute; }
                .usmp-segmented-control span { color: var(--text-muted); font-size: 14px; font-weight: 500; padding: 4px 12px; border-radius: 5px; cursor: pointer; transition: color .2s ease-in-out; }
                .usmp-segmented-control input:checked + span { background-color: var(--background-secondary); color: var(--interactive-active); }
            </style>
            
            <div class="usmp-setting-item">
                <div class="usmp-setting-info">
                    <div class="title">Показывать плеер</div>
                    <div class="note">Полностью включает или выключает отображение плеера.</div>
                </div>
                <label class="usmp-switch">
                    <input type="checkbox" id="usmp-showPlayer" ${this.settings.showPlayer ? 'checked' : ''}>
                    <span class="usmp-slider"></span>
                </label>
            </div>

            <div class="usmp-divider"></div>

            <div class="usmp-setting-item">
                 <div class="usmp-setting-info">
                    <div class="title">Положение плеера</div>
                    <div class="note">Где отображать плеер.</div>
                </div>
                <div class="usmp-segmented-control">
                    <label>
                        <input type="radio" name="playerPosition" value="above" ${this.settings.playerPosition === 'above' ? 'checked' : ''}>
                        <span>Сверху</span>
                    </label>
                    <label>
                        <input type="radio" name="playerPosition" value="below" ${this.settings.playerPosition === 'below' ? 'checked' : ''}>
                        <span>Снизу</span>
                    </label>
                </div>
            </div>

            <div class="usmp-divider"></div>

            <div class="usmp-setting-item">
                <div class="usmp-setting-info">
                    <div class="title">Кнопки управления</div>
                    <div class="note">Показывать "Следующий" и "Предыдущий" трек.</div>
                </div>
                <label class="usmp-switch">
                    <input type="checkbox" id="usmp-showTrackControls" ${this.settings.showTrackControls ? 'checked' : ''}>
                    <span class="usmp-slider"></span>
                </label>
            </div>
        `;

        panel.addEventListener("change", (e) => {
            const target = e.target;
            let settingChanged = null;

            if (target.type === "checkbox") {
                settingChanged = target.id.split('-')[1];
                this.settings[settingChanged] = target.checked;
            } else if (target.type === "radio") {
                settingChanged = target.name;
                this.settings[settingChanged] = target.value;
            }

            if (settingChanged) {
                BdApi.Data.save("UniSoundMiniPlayer", "settings", this.settings);
                this.ensureAccountPanelPlayer();
            }
        });

        return panel;
    }
    
    handleEvents(e) {
        const target = e.target.closest('[data-action]');
        if (!target || !target.closest('.unisound-account-player')) return;

        const action = target.dataset.action;
        if (!action) return;

        e.preventDefault();
        e.stopPropagation();

        this.log(`Action triggered: ${action}`);
        switch(action) {
            case 'togglePlay': this.sendCommand('togglePlay'); break;
            case 'playNext': this.sendCommand('playNext'); break;
            case 'playPrev': this.sendCommand('playPrev'); break;
        }
    }

    async sendCommand(action, body = {}) {
        if (!this.serverPort) { 
            this.error("Cannot send command, port not found."); 
            BdApi.UI.showToast('Команда не может быть отправлена: сервер UniSound не найден.', { type: 'error' });
            return; 
        }
        try {
            await fetch(`http://127.0.0.1:${this.serverPort}/api/${action}`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(body),
            });
        } catch (e) { 
            this.error("Failed to send command.", e);
            BdApi.UI.showToast('Ошибка при отправке команды в UniSound.', { type: 'error' });
        }
    }

    findAndConnect() {
        if (this.isConnecting || (this.socket && this.socket.readyState < 2)) return;
        
        this.isConnecting = true;
        this.connectionStatus = 'connecting';
        this.ensureAccountPanelPlayer();
        this.retryAttempts++;
        this.log(`Scanning for UniSound server... (Attempt ${this.retryAttempts})`);
        
        const portsToScan = Array.from({length: 11}, (_, i) => 5001 + i);
        const connectToPort = (port) => new Promise((resolve, reject) => {
            const tempSocket = new WebSocket(`ws://127.0.0.1:${port}`);
            tempSocket.onopen = () => resolve({ socket: tempSocket, port });
            tempSocket.onerror = () => reject();
        });

        Promise.any(portsToScan.map(port => connectToPort(port)))
            .then(({ socket, port }) => {
                this.isConnecting = false;
                this.retryAttempts = 0;
                this.serverPort = port;
                this.socket = socket;
                this.connectionStatus = 'connected';
                this.log(`WebSocket connection established on port ${port}.`);
                BdApi.UI.showToast('Сервер UniSound подключен!', { type: 'success' });
                this.ensureAccountPanelPlayer();
                
                clearInterval(this.reconnectInterval);
                this.reconnectInterval = null;

                socket.onmessage = async (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.track) { 
                            data.track.artworkDataUrl = await this.getArtworkDataUrl(data.track.artworkSrc); 
                        }
                        this.playerState = data;
                        this.ensureAccountPanelPlayer();
                    } catch (e) { 
                        this.error("Failed to parse message from server:", e); 
                    }
                };
                
                socket.onclose = () => {
                    this.log("WebSocket connection closed. Re-scanning for server...");
                    this.disconnect(true);
                    if (!this.reconnectInterval) { 
                        this.retryAttempts = 0;
                        this.reconnectInterval = setInterval(this.findAndConnect, 5000); 
                    }
                };
                
                socket.onerror = (err) => { 
                    this.error("WebSocket error:", err); 
                    socket.close(); 
                };
            })
            .catch(() => {
                this.isConnecting = false;
                if (this.retryAttempts >= 5) {
                    this.log("Server not found after 5 attempts. Stopping connection attempts.");
                    clearInterval(this.reconnectInterval);
                    this.reconnectInterval = null;
                    this.connectionStatus = 'error';
                    this.ensureAccountPanelPlayer();
                    BdApi.UI.showAlert("Ошибка подключения", "Не удалось найти сервер UniSound после 5 попыток. Плеер будет скрыт. Попробуйте перезапустить плагин или проверить, запущен ли UniSound.", {
                        confirmText: "Закрыть"
                    });
                    return;
                }

                if (!this.reconnectInterval) {
                    this.log(`UniSound server not found. Will retry in 5 seconds. (Attempt ${this.retryAttempts}/5)`);
                    this.connectionStatus = 'disconnected';
                    this.ensureAccountPanelPlayer();
                    this.reconnectInterval = setInterval(this.findAndConnect, 5000);
                }
            });
    }
    
    disconnect(isReconnecting = false) {
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
        if (this.socket) { 
            this.socket.close(); 
            this.socket = null; 
        }
        this.serverPort = null;
        if (!isReconnecting) {
            this.retryAttempts = 0;
        }
        this.connectionStatus = 'disconnected';
        this.ensureAccountPanelPlayer();
    }

    ensureAllPlayersRemoved() {
        document.querySelectorAll(".unisound-account-player").forEach(e => e.remove());
    }

    ensureAccountPanelPlayer() {
        const parentPanel = document.querySelector(this.accountPanelParentSelector);
        if (!parentPanel) return;

        let existingPlayer = parentPanel.querySelector(".unisound-account-player");

        const shouldShow = this.settings.showPlayer && this.connectionStatus !== 'error';
        if (!shouldShow) {
            if (existingPlayer) existingPlayer.remove();
            return;
        }

        if (!existingPlayer) {
            const playerHTML = (this.connectionStatus !== 'connected' || !this.playerState.track)
                ? this.createStatusPlayerHTML()
                : this.createAccountPlayerHTML();
            const position = this.settings.playerPosition === 'above' ? 'afterbegin' : 'beforeend';
            parentPanel.insertAdjacentHTML(position, playerHTML);
            return;
        }

        const isAbove = this.settings.playerPosition === 'above';
        if ((isAbove && parentPanel.firstElementChild !== existingPlayer) || (!isAbove && parentPanel.lastElementChild !== existingPlayer)) {
            if (isAbove) parentPanel.prepend(existingPlayer);
            else parentPanel.append(existingPlayer);
        }

        const shouldBeStatusView = this.connectionStatus !== 'connected' || !this.playerState.track;
        const isCurrentlyStatusView = existingPlayer.classList.contains('uap-status-view');

        if (shouldBeStatusView) {
            if (!isCurrentlyStatusView) {
                const newPlayer = this.createStatusPlayerHTML(true);
                existingPlayer.replaceWith(newPlayer);
            } else {
                existingPlayer.querySelector('.uap-status-text').innerText = this.connectionStatus === 'connecting' ? `Поиск сервера... (${this.retryAttempts}/5)` : 'Переподключение...';
            }
        } else {
            if (isCurrentlyStatusView) {
                const newPlayer = this.createAccountPlayerHTML(true);
                existingPlayer.replaceWith(newPlayer);
            } else {
                this.updatePlayerContent(existingPlayer);
            }
        }
    }
    
    updatePlayerContent(playerElement) {
        const { playing, track } = this.playerState;
        if (!track) return;
    
        const currentTrackId = `${track.title}-${track.artist}`;
        const currentPlayState = playing ? 'playing' : 'paused';
        if (playerElement.dataset.trackId === currentTrackId && playerElement.classList.contains(currentPlayState)) {
             return;
        }
    
        playerElement.dataset.trackId = currentTrackId;
        playerElement.className = `unisound-account-player ${currentPlayState}`;
    
        const newArtworkUrl = track.artworkDataUrl || '';
        const artworkEl = playerElement.querySelector('.uap-artwork');
        if (artworkEl.src !== newArtworkUrl) artworkEl.src = newArtworkUrl;

        playerElement.querySelector('.uap-title').innerText = track.title;
        playerElement.querySelector('.uap-artist').innerText = track.artist;
        playerElement.querySelector('.uap-button-play').classList.toggle('uap-paused', !playing);

        const controls = playerElement.querySelector('.uap-controls');
        const prevButton = controls.querySelector('[data-action="playPrev"]');
        const nextButton = controls.querySelector('[data-action="playNext"]');

        if (this.settings.showTrackControls) {
            if (!prevButton) controls.insertAdjacentHTML('afterbegin', this.createControlButtonHTML('playPrev'));
            if (!nextButton) controls.insertAdjacentHTML('beforeend', this.createControlButtonHTML('playNext'));
        } else {
            if (prevButton) prevButton.remove();
            if (nextButton) nextButton.remove();
        }
    }

    createControlButtonHTML(action) {
        const icons = {
            playPrev: '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M6 18V6h2v12H6zm3.5-6L18 6v12l-8.5-6z"></path></svg>',
            playNext: '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M16 18h2V6h-2v12zm-4.5-6L6 6v12l8.5-6z"></path></svg>'
        };
        const labels = { playPrev: "Previous Track", playNext: "Next Track" };
        return `<button class="uap-button uap-button-small" data-action="${action}" aria-label="${labels[action]}">${icons[action]}</button>`;
    }

    createAccountPlayerHTML(asElement = false) {
        const { track, playing } = this.playerState;
        const html = `
            <div class="unisound-account-player ${playing ? 'playing' : 'paused'}" data-track-id="${track ? `${track.title}-${track.artist}` : ''}">
                <img class="uap-artwork" src="${track?.artworkDataUrl || ''}" alt="Artwork">
                <div class="uap-info">
                    <div class="uap-title">${track?.title || ''}</div>
                    <div class="uap-artist">${track?.artist || ''}</div>
                </div>
                <div class="uap-controls">
                    ${this.settings.showTrackControls ? this.createControlButtonHTML('playPrev') : ''}
                    <button class="uap-button uap-button-play ${playing ? '' : 'uap-paused'}" data-action="togglePlay" aria-label="Play/Pause">
                        <svg class="uap-icon-play" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"></path></svg>
                        <svg class="uap-icon-pause" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>
                    </button>
                    ${this.settings.showTrackControls ? this.createControlButtonHTML('playNext') : ''}
                </div>
            </div>`;
        if (!asElement) return html;
        const template = document.createElement('template');
        template.innerHTML = html.trim();
        return template.content.firstChild;
    }

    createStatusPlayerHTML(asElement = false) {
        const message = this.connectionStatus === 'connecting' ? `Поиск сервера... (${this.retryAttempts}/5)` : 'Переподключение...';
        const html = `
            <div class="unisound-account-player uap-status-view">
                <div class="uap-status-text">${message}</div>
                <div class="uap-spinner"></div>
            </div>`;
        if (!asElement) return html;
        const template = document.createElement('template');
        template.innerHTML = html.trim();
        return template.content.firstChild;
    }
    
    async getArtworkDataUrl(url) {
        if (!url) return null;
        if (this.artworkCache.has(url)) return this.artworkCache.get(url);
        
        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => { 
                    this.artworkCache.set(url, reader.result); 
                    resolve(reader.result); 
                };
                reader.readAsDataURL(blob);
            });
        } catch (e) { 
            this.error("Failed to fetch artwork", e);
            return null; 
        }
    }

    injectCSS() {
        const css = `
            .unisound-account-player {
                display: grid !important; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center;
                width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 6px;
                background-color: var(--background-secondary-alt); user-select: none; flex-shrink: 0;
            }
            section[class^="panels_"] > .unisound-account-player:first-child { margin-bottom: 8px; }
            section[class^="panels_"] > .unisound-account-player:last-child { margin-top: 8px; margin-bottom: 0; }
            .unisound-account-player:hover { background-color: var(--background-secondary); }

            .uap-artwork {
                width: 38px; height: 38px; border-radius: 4px; object-fit: cover; flex-shrink: 0;
                background-color: var(--background-tertiary);
            }
            .uap-info { min-width: 0; }
            .uap-title { color: var(--header-primary); font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .uap-artist { color: var(--header-secondary); font-size: 11px; font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .uap-controls { display: flex; align-items: center; gap: 4px; }
            .uap-button { background: none; border: none; color: var(--interactive-normal); cursor: pointer; border-radius: 50%; display: flex; align-items: center; justify-content: center; padding: 0; }
            .uap-button-small { width: 26px; height: 26px; }
            .uap-button-small:hover { background-color: var(--background-modifier-hover); color: var(--interactive-hover); }
            
            .uap-button-play { width: 30px; height: 30px; background-color: var(--interactive-normal); position: relative; }
            .uap-button-play:hover { background-color: var(--interactive-hover); }
            .uap-button-play svg {
                color: var(--primary-860, #fff);
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                transition: opacity 0.15s ease;
            }
            .uap-button-play .uap-icon-play { margin-left: 1px; }
            .uap-button-play .uap-icon-pause { opacity: 1; }
            .uap-button-play .uap-icon-play { opacity: 0; }
            .uap-button-play.uap-paused .uap-icon-pause { opacity: 0; }
            .uap-button-play.uap-paused .uap-icon-play { opacity: 1; }

            .uap-status-view { grid-template-columns: 1fr auto; padding: 12px 10px; }
            .uap-status-text { font-size: 14px; font-weight: 500; color: var(--header-secondary); }
            .uap-spinner { width: 20px; height: 20px; border: 2px solid var(--interactive-muted); border-top-color: var(--interactive-normal); border-radius: 50%; animation: uap-spin 1s linear infinite; }

            @keyframes uap-spin { to { transform: rotate(360deg); } }
        `;
        BdApi.DOM.addStyle(this.cssId, css);
    }
};
