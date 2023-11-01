'use strict';

import { readdirSync } from 'fs';
import * as url from 'node:url';
import { fileURLToPath, pathToFileURL } from 'url';
import { join, basename, extname, dirname } from 'path';
import express, { static as staticfiles, urlencoded, json } from 'express';
import multer, { memoryStorage } from 'multer';
import rfc2047 from 'rfc2047';
import Debug from 'debug';
import { mimetype as _mimetype } from './util.js';
import Middleware from './middleware.js';
import { randomUUID } from 'crypto';
const debug = Debug('versed');

import dotenv from 'dotenv';
dotenv.config();

// const __filename = new URL(import.meta.url).pathname;
// const __dirname = path.dirname(__filename);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create processing pipeline
let middleware = new Middleware();


readdirSync(join(__dirname, 'middleware')).forEach(async function(file) {
    const module = await import(pathToFileURL(join(__dirname, 'middleware', file)));
    debug('imported %s as middleware', file);
    middleware.use(module.default);
});

function authentication(req, res, next) {
    let api_key = req.header("x-api-key"); //Add API key to headers
    if(req.header('x-api-key')){
        if (api_key == process.env.API_KEY) {
            next();
        } else {
            res.status(403).json({
                status: false,
                message: 'invalid API key'
            });
        }
    }else{
        const authheader = req.headers.authorization;
        console.log(req.headers);    
        if (!authheader) {
            res.setHeader('WWW-Authenticate', 'Basic');
            return res.status(401).json({"message":"You are not autheticated"});
        }    
        const auth = new Buffer.from(authheader.split(' ')[1],'base64').toString().split(':');
        const user = auth[0];
        const pass = auth[1];
        if (user == process.env.BASIC_AUTH_USERNAME && pass == process.env.BASIC_AUTH_PASSWORD) {
            next();
        } else {
            res.setHeader('WWW-Authenticate', 'Basic');
            return res.status(401).json({"message":"You are not autheticated"});
        }
    }
}

// Create express app
const app = express();

app.use(authentication);
app.use(staticfiles('public'));
app.use(urlencoded({extended: true}));
app.use(json());

const storage = memoryStorage();
const upload = multer({ storage: storage });

app.post('/convert', upload.single('file'), function (req, res) {
    const start = Date.now();
    const id = randomUUID();
    const filename = rfc2047.decode(req.file.originalname);
    const inboundMime = _mimetype(filename);
    if (!inboundMime) {
        console.error(`issues generating mimetype from '${req.file.originalname}' as ${filename}`,  req.file);
    }
    debug('POST %s %s %o', id, req.path, {originalname: req.file.originalname, mimetype:inboundMime.full, ocr: req.body.ocr, size: req.file.size});

    // Run file through the pipeline
    middleware.run({
        id,
        input: {
            ...req.body,
            filename: filename,
            mimetype: inboundMime.full,
            type: inboundMime.type,
            buffer: req.file.buffer,
            ocr: req.body.ocr,
        }
    }, (context) => {
        if (context.error) {
            console.error(context.error);
        }
        const outboundMime = _mimetype(context.input.format);
        // Send the result or error
        if (context.output) {
            const head = {
                'Content-Type': outboundMime.full,
                'Content-disposition': 'attachment;filename=' + basename(context.input.filename, extname(context.input.filename))
                    + '.' + (context.output.format || req.body.format),
                'Content-Length': context.output.buffer.length
            };
            res.writeHead(200, head);
            res.end(context.output.buffer);
            debug('RESPONSE 200: %s, duration: %d ms, header: %o', id, Date.now()-start, head);
        } else {
            res.status(500).end();
            debug('RESPONSE 500: %s, duration: %d ms', id, Date.now()-start);
        }
    });
});


function main() {
    const server = app.listen(process.env.APP_PORT, function () {
        console.log('Listening on port '+process.env.APP_PORT);
        setTimeout(()=>{
            app.emit('appStarted');
        }, 1000);
    });
    process.on('SIGINT', function() {
        console.log('Caught interrupt signal');
        server.close(()=> {
            process.exit();
        });
    });
}

// check if main module...
if (typeof require !== 'undefined' && require.main === module) {
    // is CommonJS main
    main();
} else if (import.meta.url.startsWith('file:')) { // (A)
    // is ESM module main
    const modulePath = url.fileURLToPath(import.meta.url);
    // possibly test (import.meta.url === pathToFileURL(process.argv[1]).href)
    if (process.argv[1] === modulePath) { // (B)
        // Main ESM module
        main();
    }
}

export default app;
