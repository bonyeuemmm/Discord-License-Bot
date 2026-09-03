const { spawn } = require('child_process');

const scriptName = 'index.js';

const RESTART_INTERVAL = 3 * 60 * 1000; 

function startBot() {
    console.log(`[Code Runner] Đang khởi động bot (${scriptName})...`);
    
    const botProcess = spawn('node', [scriptName], {
        stdio: 'inherit',
        shell: true
    });

    botProcess.on('exit', (code, signal) => {
        console.log(`[Code Runner] Bot đã dừng với mã ${code} và tín hiệu ${signal}.`);
    });

    const timer = setTimeout(() => {
        console.log('[Code Runner] Đã đủ 3 phút, tiến hành khởi động lại bot...');
        if (!botProcess.killed) {
            botProcess.kill('SIGTERM');
        }
    }, RESTART_INTERVAL);

    botProcess.on('close', () => {
        clearTimeout(timer);
        setTimeout(startBot, 1000);
    });
}

startBot();