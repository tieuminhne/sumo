const http = require('http');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const PORT = 9100;
const SERIAL_PORT = 'COM3'; // Đổi cổng tương ứng (COM3, COM4, /dev/ttyUSB0...)

let serialPort = null;

async function initSerial() {
    try {
        serialPort = new SerialPort({
            path: SERIAL_PORT,
            baudRate: 9600
        });
        
        serialPort.on('error', (err) => {
            console.error('Serial error:', err.message);
        });
        
        serialPort.on('open', () => {
            console.log('Serial port opened:', SERIAL_PORT);
        });
        
        console.log('Đang chờ in...');
    } catch(e) {
        console.error('Lỗi mở serial:', e.message);
        process.exit(1);
    }
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/print') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            if (!serialPort || !serialPort.isOpen) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Serial not connected');
                return;
            }
            
            serialPort.write(body + '\n', (err) => {
                if (err) {
                    console.error('Write error:', err.message);
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Write error: ' + err.message);
                } else {
                    console.log('Đã in:', body.substring(0, 50) + '...');
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('OK');
                }
            });
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT, () => {
    console.log(`Server in bill chạy tại http://localhost:${PORT}`);
    initSerial();
});