// SerialPad - 串口控制应用
class SerialControlApp {
    constructor() {
        // 串口相关属性
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.isReading = false;
        
        // 应用状态
        this.commandCount = 0;
        this.lastCommand = '';
        this.logPaused = false;
        this.logEntries = [];
        
        // 键盘映射
        this.keyMapping = {
            'w': 'up', 'ArrowUp': 'up',
            's': 'down', 'ArrowDown': 'down',
            'a': 'left', 'ArrowLeft': 'left',
            'd': 'right', 'ArrowRight': 'right'
        };
        
        // 命令映射
        this.commandMapping = {
            'up': 'U',
            'down': 'D',
            'left': 'L',
            'right': 'R',
            'START': 'START',
            'STOP': 'STOP',
            'RESET': 'RESET'
        };
        
        // 鼠标控制属性
        this.mouseControlBox = null;
        this.mouseCenter = null;
        this.mouseXDisplay = null;
        this.mouseYDisplay = null;
        
        this.mouseX = 0;
        this.mouseY = 0;
        this.centerX = 0;
        this.centerY = 0;
        this.boxWidth = 0;
        this.boxHeight = 0;
        
        // 坐标范围常量
        this.MIN_COORD = -128;
        this.MAX_COORD = 127;
        
        // 坐标发送阈值
        this.coordSendThreshold = 3;
        this.lastSentX = 0;
        this.lastSentY = 0;
        this.mouseActive = false;
        this.mouseLeftPressed = false;
        
        this.initDOMReferences();
        this.initEventListeners();
        this.initMouseControl();
        this.updateUI();
        this.addLogEntry('info', 'SerialPad 已初始化, 请连接串口设备');
        // this.addLogEntry('info', '鼠标控制: 左键点击发送当前坐标, 右键点击发送 (0,0), 坐标范围 -128~127');
    }
    
    // 初始化DOM元素引用
    initDOMReferences() {
        this.connectBtn = document.getElementById('connectBtn');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.portInfo = document.getElementById('portInfo');
        this.baudrateSelect = document.getElementById('baudrate');
        
        this.upBtn = document.getElementById('upBtn');
        this.downBtn = document.getElementById('downBtn');
        this.leftBtn = document.getElementById('leftBtn');
        this.rightBtn = document.getElementById('rightBtn');
        
        this.lastCommandDisplay = document.getElementById('lastCommand');
        this.commandCountDisplay = document.getElementById('commandCount');
        
        this.mouseControlBox = document.getElementById('mouseControlBox');
        this.mouseCenter = document.getElementById('mouseCenter');
        this.mouseXDisplay = document.getElementById('mouseX');
        this.mouseYDisplay = document.getElementById('mouseY');
        
        this.customCommandInput = document.getElementById('customCommand');
        this.sendCustomBtn = document.getElementById('sendCustomBtn');
        this.quickCommandBtns = document.querySelectorAll('.quick-btn');
        
        this.clearLogBtn = document.getElementById('clearLogBtn');
        this.pauseLogBtn = document.getElementById('pauseLogBtn');
        this.logEntriesContainer = document.getElementById('logEntries');
    }
    
    // 初始化事件监听器
    initEventListeners() {
        this.connectBtn.addEventListener('click', () => this.connectSerial());
        this.disconnectBtn.addEventListener('click', () => this.disconnectSerial());
        
        this.upBtn.addEventListener('click', () => this.sendCommand('up'));
        this.downBtn.addEventListener('click', () => this.sendCommand('down'));
        this.leftBtn.addEventListener('click', () => this.sendCommand('left'));
        this.rightBtn.addEventListener('click', () => this.sendCommand('right'));
        
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
        
        if (this.mouseControlBox) {
            this.mouseControlBox.addEventListener('mousedown', (e) => this.handleMouseDown(e));
            this.mouseControlBox.addEventListener('mousemove', (e) => this.handleMouseMove(e));
            this.mouseControlBox.addEventListener('mouseenter', () => this.handleMouseEnter());
            this.mouseControlBox.addEventListener('mouseleave', () => this.handleMouseLeave());
            this.mouseControlBox.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.resetMousePosition();
                return false;
            });
        }
        
        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.mouseLeftPressed = false;
            }
        });
        
        this.sendCustomBtn.addEventListener('click', () => this.sendCustomCommand());
        this.customCommandInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendCustomCommand();
        });
        
        this.quickCommandBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const rawCommand = btn.getAttribute('data-command');
                const command = this.commandMapping[rawCommand] || rawCommand;
                this.sendCustomCommand(command);
            });
        });
        
        this.clearLogBtn.addEventListener('click', () => this.clearLog());
        this.pauseLogBtn.addEventListener('click', () => this.toggleLogPause());
    }
    
    // 初始化鼠标控制
    initMouseControl() {
        if (!this.mouseControlBox) return;
        
        const updateBoxDimensions = () => {
            const rect = this.mouseControlBox.getBoundingClientRect();
            this.boxWidth = rect.width;
            this.boxHeight = rect.height;
            this.centerX = this.boxWidth / 2;
            this.centerY = this.boxHeight / 2;
            
            this.mouseX = this.centerX;
            this.mouseY = this.centerY;
            this.updateMouseDisplay();
            
            this.lastSentX = 0;
            this.lastSentY = 0;
        };
        
        updateBoxDimensions();
        window.addEventListener('resize', updateBoxDimensions);
        this.addGridLines();
    }
    
    // 添加网格线和刻度
    addGridLines() {
        const verticalLine = document.createElement('div');
        verticalLine.className = 'grid-line vertical';
        verticalLine.style.left = '50%';
        this.mouseControlBox.appendChild(verticalLine);
        
        const horizontalLine = document.createElement('div');
        horizontalLine.className = 'grid-line horizontal';
        horizontalLine.style.top = '50%';
        this.mouseControlBox.appendChild(horizontalLine);
        
        this.addRegionLabelsAndScales();
    }
    
    addRegionLabelsAndScales() {
        this.addCoordinateScales();
        
        const quadrants = [
            { text: 'II', top: '25%', left: '25%' },
            { text: 'I', top: '25%', left: '75%' },
            { text: 'III', top: '75%', left: '25%' },
            { text: 'IV', top: '75%', left: '75%' }
        ];
        
        quadrants.forEach(quadrant => {
            const label = document.createElement('div');
            label.className = 'region-label';
            label.textContent = quadrant.text;
            label.style.position = 'absolute';
            label.style.top = quadrant.top;
            label.style.left = quadrant.left;
            label.style.transform = 'translate(-50%, -50%)';
            label.style.color = 'rgba(0, 0, 0, 0.2)';
            label.style.fontSize = '0.9rem';
            label.style.fontWeight = 'bold';
            label.style.pointerEvents = 'none';
            this.mouseControlBox.appendChild(label);
        });
    }
    
    addCoordinateScales() {
        const scales = [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75];
        
        scales.forEach(scale => {
            const scaleLine = document.createElement('div');
            scaleLine.className = 'grid-line';
            scaleLine.style.position = 'absolute';
            scaleLine.style.left = `${50 + scale * 50}%`;
            scaleLine.style.top = '49%';
            scaleLine.style.width = '1px';
            scaleLine.style.height = '4px';
            scaleLine.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
            scaleLine.style.pointerEvents = 'none';
            this.mouseControlBox.appendChild(scaleLine);
            
            const coordValue = Math.round(scale * 128);
            const scaleLabel = document.createElement('div');
            scaleLabel.className = 'coordinate-scale';
            scaleLabel.textContent = coordValue;
            scaleLabel.style.position = 'absolute';
            scaleLabel.style.left = `${50 + scale * 50}%`;
            scaleLabel.style.top = '53%';
            scaleLabel.style.transform = 'translate(-50%, 0)';
            scaleLabel.style.color = 'rgba(0, 0, 0, 0.3)';
            scaleLabel.style.fontSize = '0.6rem';
            scaleLabel.style.fontWeight = 'bold';
            scaleLabel.style.pointerEvents = 'none';
            this.mouseControlBox.appendChild(scaleLabel);
        });
        
        scales.forEach(scale => {
            const scaleLine = document.createElement('div');
            scaleLine.className = 'grid-line';
            scaleLine.style.position = 'absolute';
            scaleLine.style.left = '49%';
            scaleLine.style.top = `${50 + scale * 50}%`;
            scaleLine.style.width = '4px';
            scaleLine.style.height = '1px';
            scaleLine.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
            scaleLine.style.pointerEvents = 'none';
            this.mouseControlBox.appendChild(scaleLine);
            
            const coordValue = Math.round(-scale * 128);
            const scaleLabel = document.createElement('div');
            scaleLabel.className = 'coordinate-scale';
            scaleLabel.textContent = coordValue;
            scaleLabel.style.position = 'absolute';
            scaleLabel.style.left = '46%';
            scaleLabel.style.top = `${50 + scale * 50}%`;
            scaleLabel.style.transform = 'translate(-100%, -50%)';
            scaleLabel.style.color = 'rgba(0, 0, 0, 0.3)';
            scaleLabel.style.fontSize = '0.6rem';
            scaleLabel.style.fontWeight = 'bold';
            scaleLabel.style.pointerEvents = 'none';
            this.mouseControlBox.appendChild(scaleLabel);
        });
        
        const originLabel = document.createElement('div');
        originLabel.className = 'origin-label';
        originLabel.textContent = '(0,0)';
        originLabel.style.position = 'absolute';
        originLabel.style.left = '52%';
        originLabel.style.top = '52%';
        originLabel.style.color = 'rgba(255, 0, 0, 0.7)';
        originLabel.style.fontSize = '0.7rem';
        originLabel.style.fontWeight = 'bold';
        originLabel.style.pointerEvents = 'none';
        this.mouseControlBox.appendChild(originLabel);
    }
    
    // 串口连接
    async connectSerial() {
        try {
            if (!('serial' in navigator)) {
                this.addLogEntry('info', '错误: 浏览器不支持 Web Serial API');
                alert('请使用 Chrome 89+ 或 Edge 89+, 并确保在 HTTPS/localhost 下运行');
                return;
            }
            this.port = await navigator.serial.requestPort();
            const baudRate = parseInt(this.baudrateSelect.value);
            await this.port.open({ baudRate });
            
            this.isConnected = true;
            this.addLogEntry('info', `串口已连接, 波特率: ${baudRate}`);
            this.updateUI();
            this.startReading();
        } catch (error) {
            this.addLogEntry('info', `连接失败: ${error.message}`);
        }
    }
    
    async disconnectSerial() {
        if (this.port && this.isConnected) {
            try {
                if (this.isReading && this.reader) this.reader.cancel();
                if (this.writer) {
                    await this.writer.close();
                    this.writer = null;
                }
                await this.port.close();
                this.isConnected = false;
                this.port = null;
                this.addLogEntry('info', '串口已断开');
            } catch (error) {
                this.addLogEntry('info', `断开连接时出错: ${error.message}`);
            }
        }
        this.updateUI();
    }
    
    async startReading() {
        if (!this.port || !this.isConnected) return;
        try {
            const textDecoder = new TextDecoder();
            this.isReading = true;
            while (this.port.readable && this.isReading) {
                this.reader = this.port.readable.getReader();
                try {
                    while (true) {
                        const { value, done } = await this.reader.read();
                        if (done) break;
                        if (value) {
                            const text = textDecoder.decode(value);
                            this.addLogEntry('received', text);
                        }
                    }
                } catch (error) {
                    console.error('读取错误: ', error);
                } finally {
                    this.reader.releaseLock();
                }
            }
        } catch (error) {
            console.error('开始读取错误: ', error);
        }
    }
    
    async sendCommand(direction) {
        if (!this.isConnected) {
            this.addLogEntry('info', '错误: 请先连接串口');
            this.showConnectionWarning();
            return;
        }
        const commandCode = this.commandMapping[direction] || direction;
        this.lastCommand = commandCode;
        this.commandCount++;
        this.lastCommandDisplay.textContent = commandCode;
        this.commandCountDisplay.textContent = this.commandCount;
        await this.sendData(commandCode);
        this.addLogEntry('sent', commandCode);
        this.animateButtonPress(direction);
    }
    
    async sendCustomCommand(customCommand = null) {
        let command = customCommand || this.customCommandInput.value.trim();
        if (!command) {
            this.addLogEntry('info', '错误: 命令不能为空');
            return;
        }
        if (!this.isConnected) {
            this.addLogEntry('info', '错误: 请先连接串口');
            this.showConnectionWarning();
            return;
        }
        this.lastCommand = command;
        this.commandCount++;
        this.lastCommandDisplay.textContent = command;
        this.commandCountDisplay.textContent = this.commandCount;
        await this.sendData(command);
        this.addLogEntry('sent', command);
        if (!customCommand) this.customCommandInput.value = '';
    }
    
    async sendData(data) {
        if (!this.port || !this.isConnected) return;
        try {
            if (!this.writer) {
                this.writer = this.port.writable.getWriter();
            }
            const encoder = new TextEncoder();
            await this.writer.write(encoder.encode(data + '\n'));
        } catch (error) {
            console.error('发送错误: ', error);
            this.addLogEntry('info', `发送失败: ${error.message}`);
            this.isConnected = false;
            this.updateUI();
        }
    }
    
    handleKeyPress(event) {
        const direction = this.keyMapping[event.key];
        if (direction) {
            event.preventDefault();
            this.sendCommand(direction);
        }
    }
    
    animateButtonPress(direction) {
        let button;
        switch(direction) {
            case 'up': button = this.upBtn; break;
            case 'down': button = this.downBtn; break;
            case 'left': button = this.leftBtn; break;
            case 'right': button = this.rightBtn; break;
            default: return;
        }
        button.classList.add('active');
        setTimeout(() => button.classList.remove('active'), 300);
    }
    
    showConnectionWarning() {
        const originalHTML = this.connectBtn.innerHTML;
        this.connectBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 请先连接串口';
        this.connectBtn.style.backgroundColor = '#e74c3c';
        setTimeout(() => {
            this.connectBtn.innerHTML = originalHTML;
            this.connectBtn.style.backgroundColor = '';
        }, 2000);
    }
    
    // 像素坐标转范围坐标
    pixelToCoordinate(pixelX, pixelY) {
        let x = Math.round(pixelX - this.centerX);
        let y = Math.round(pixelY - this.centerY);
        x = Math.max(this.MIN_COORD, Math.min(this.MAX_COORD, x));
        y = Math.max(this.MIN_COORD, Math.min(this.MAX_COORD, y));
        return { x, y };
    }
    
    handleMouseDown(e) {
        if (!this.isConnected) {
            this.addLogEntry('info', '错误: 请先连接串口');
            this.showConnectionWarning();
            return;
        }
        if (e.button === 0) {
            this.mouseLeftPressed = true;
            const rect = this.mouseControlBox.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const coord = this.pixelToCoordinate(x, y);
            this.sendMouseCoordinate(coord.x, coord.y);
            this.showMouseClickFeedback(e.offsetX, e.offsetY);
        }
    }
    
    handleMouseMove(e) {
        if (!this.isConnected || !this.mouseActive || !this.mouseLeftPressed) return;
        
        const rect = this.mouseControlBox.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (x < 0 || x > this.boxWidth || y < 0 || y > this.boxHeight) return;
        
        this.mouseX = x;
        this.mouseY = y;
        this.updateMouseDisplay();
        
        const coord = this.pixelToCoordinate(x, y);
        
        const dx = coord.x - this.lastSentX;
        const dy = coord.y - this.lastSentY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance >= this.coordSendThreshold) {
            this.sendMouseCoordinate(coord.x, coord.y);
            this.lastSentX = coord.x;
            this.lastSentY = coord.y;
            this.showCoordinateFeedback(coord.x, coord.y, x, y);
        }
    }
    
    handleMouseEnter() {
        this.mouseActive = true;
        this.mouseControlBox.style.borderColor = 'var(--primary-color)';
        this.addLogEntry('info', '鼠标控制已激活');
        this.lastSentX = 0;
        this.lastSentY = 0;
    }
    
    handleMouseLeave() {
        this.mouseActive = false;
        this.mouseLeftPressed = false;
        this.mouseControlBox.style.borderColor = '#ccc';
        if (this.isConnected) {
            this.sendMouseCoordinate(0, 0);
            this.addLogEntry('info', '鼠标离开区域, 发送 (0,0)');
        }
    }
    
    resetMousePosition() {
        this.mouseX = this.centerX;
        this.mouseY = this.centerY;
        this.updateMouseDisplay();
        this.sendMouseCoordinate(0, 0);
        this.lastSentX = 0;
        this.lastSentY = 0;
        this.mouseLeftPressed = false;
        this.addLogEntry('info', '重置到中心, 发送 (0,0)');
        this.showResetFeedback();
    }
    
    updateMouseDisplay() {
        if (this.mouseXDisplay && this.mouseYDisplay) {
            const coord = this.pixelToCoordinate(this.mouseX, this.mouseY);
            this.mouseXDisplay.textContent = coord.x;
            this.mouseYDisplay.textContent = coord.y;
        }
    }
    
    sendMouseCoordinate(x, y) {
        const coordinate = `(${x},${y})`;
        this.lastCommand = coordinate;
        this.commandCount++;
        this.lastCommandDisplay.textContent = coordinate;
        this.commandCountDisplay.textContent = this.commandCount;
        this.sendData(coordinate);
        this.addLogEntry('sent', `坐标: ${coordinate}`);
    }
    
    showMouseClickFeedback(x, y) {
        const feedback = document.createElement('div');
        feedback.className = 'direction-indicator';
        feedback.style.left = `${x}px`;
        feedback.style.top = `${y}px`;
        feedback.style.width = '20px';
        feedback.style.height = '20px';
        feedback.style.backgroundColor = 'rgba(231, 76, 60, 0.7)';
        this.mouseControlBox.appendChild(feedback);
        setTimeout(() => {
            if (feedback.parentNode) feedback.parentNode.removeChild(feedback);
        }, 500);
    }
    
    showCoordinateFeedback(x, y, screenX, screenY) {
        const feedback = document.createElement('div');
        feedback.className = 'coordinate-indicator';
        feedback.textContent = `${x},${y}`;
        feedback.style.left = `${screenX}px`;
        feedback.style.top = `${screenY}px`;
        this.mouseControlBox.appendChild(feedback);
        setTimeout(() => {
            feedback.style.opacity = '0';
            feedback.style.transition = 'opacity 0.3s';
        }, 300);
        setTimeout(() => {
            if (feedback.parentNode) feedback.parentNode.removeChild(feedback);
        }, 600);
        
        const trail = document.createElement('div');
        trail.className = 'coordinate-trail';
        trail.style.left = `${screenX}px`;
        trail.style.top = `${screenY}px`;
        this.mouseControlBox.appendChild(trail);
        setTimeout(() => {
            trail.style.opacity = '0';
            trail.style.transition = 'opacity 0.5s';
            setTimeout(() => {
                if (trail.parentNode) trail.parentNode.removeChild(trail);
            }, 500);
        }, 300);
    }
    
    showResetFeedback() {
        const ripple = document.createElement('div');
        ripple.className = 'direction-indicator';
        ripple.style.left = '50%';
        ripple.style.top = '50%';
        ripple.style.width = '0px';
        ripple.style.height = '0px';
        ripple.style.backgroundColor = 'rgba(52, 152, 219, 0.3)';
        ripple.style.border = '2px solid rgba(52, 152, 219, 0.5)';
        ripple.style.borderRadius = '50%';
        this.mouseControlBox.appendChild(ripple);
        
        let size = 0;
        const maxSize = Math.min(this.boxWidth, this.boxHeight) * 0.8;
        const animate = () => {
            size += 5;
            ripple.style.width = `${size}px`;
            ripple.style.height = `${size}px`;
            ripple.style.opacity = `${1 - size / maxSize}`;
            if (size < maxSize) {
                requestAnimationFrame(animate);
            } else {
                if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
            }
        };
        requestAnimationFrame(animate);
    }
    
    addLogEntry(type, data) {
        if (this.logPaused) return;
        const timestamp = new Date().toLocaleTimeString();
        this.logEntries.push({ timestamp, type, data });
        if (this.logEntries.length > 100) this.logEntries.shift();
        this.updateLogDisplay();
    }
    
    updateLogDisplay() {
        if (this.logPaused) return;
        const placeholder = this.logEntriesContainer.querySelector('.info');
        this.logEntriesContainer.innerHTML = placeholder ? placeholder.outerHTML : '';
        this.logEntries.forEach(entry => {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry ${entry.type}`;
            logEntry.innerHTML = `
                <span class="log-timestamp">${entry.timestamp}</span>
                <span class="log-direction ${entry.type}">${entry.type.toUpperCase()}</span>
                <span class="log-data">${this.escapeHtml(entry.data)}</span>
            `;
            this.logEntriesContainer.appendChild(logEntry);
        });
        this.logEntriesContainer.scrollTop = this.logEntriesContainer.scrollHeight;
    }
    
    clearLog() {
        this.logEntries = [];
        this.logEntriesContainer.innerHTML = `
            <div class="log-entry info">
                <span class="log-timestamp">--:--:--</span>
                <span class="log-direction">INFO</span>
                <span class="log-data">日志已清空</span>
            </div>
        `;
        this.addLogEntry('info', '日志已清空');
    }
    
    toggleLogPause() {
        this.logPaused = !this.logPaused;
        if (this.logPaused) {
            this.pauseLogBtn.innerHTML = '<i class="fas fa-play"></i> 继续更新';
            this.addLogEntry('info', '日志更新已暂停');
        } else {
            this.pauseLogBtn.innerHTML = '<i class="fas fa-pause"></i> 暂停更新';
            this.updateLogDisplay();
            this.addLogEntry('info', '日志更新已恢复');
        }
    }
    
    updateUI() {
        if (this.isConnected) {
            this.statusDot.className = 'status-dot connected';
            this.statusText.textContent = '已连接';
            this.portInfo.textContent = this.port?.getInfo().usbProductId 
                ? `设备已连接 (PID: ${this.port.getInfo().usbProductId})` 
                : '串口已连接';
            this.connectBtn.disabled = true;
            this.disconnectBtn.disabled = false;
            [this.upBtn, this.downBtn, this.leftBtn, this.rightBtn].forEach(btn => btn.disabled = false);
            this.sendCustomBtn.disabled = false;
        } else {
            this.statusDot.className = 'status-dot';
            this.statusText.textContent = '未连接';
            this.portInfo.textContent = '未选择端口';
            this.connectBtn.disabled = false;
            this.disconnectBtn.disabled = true;
            [this.upBtn, this.downBtn, this.leftBtn, this.rightBtn].forEach(btn => btn.disabled = true);
            this.sendCustomBtn.disabled = true;
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    const app = new SerialControlApp();
    window.serialApp = app;
    console.log('SerialPad 已加载');
});

