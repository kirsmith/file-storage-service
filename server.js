/**
 * Created by Smith on 02.02.2018 23:41
 * */

let express = require('express'),
    path = require('path'),
    logger = require('morgan'),
    methodOverride = require('method-override'),
    bodyParser = require('body-parser'),
    hlp = require('./libs/helper')(module),
    multer = require('multer'),
    fs = require('fs'),
    uuid = require('uuid/v4');

let upl = multer({ dest : 'uploads/'});

let app = express();

let conf_data = require('./config.json');


logger.token('size', function(req, res) {
    let l = res._contentLength,
        ls = '';
    if (l < 1024) ls = l + ' B';
    else if (l < 1048576) ls = Math.ceil(l / 1024) + ' KB';
    else ls = Math.ceil(l / 1048576) + ' MB';
    return ls;
});
logger.token('remote-ip', function (req) {
    return (req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress).split(':')[3];
});
app.use(logger(':date[iso] | :remote-ip | :method :url :response-time ms - :size')); // выводим все запросы со статусами в консоль

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json()); // parse application/json
app.use(bodyParser.urlencoded({ extended: true })); // parse application/x-www-form-urlencoded
app.use(bodyParser.raw({ type: 'application/octet-stream', limit: '50mb' })); // parse application/octet-stream
app.use(methodOverride()); // поддержка put и delete



app.get('/favicon.ico', function(req, res) {
    res.status(204);
});

// удаление тега X-Powered-By из заголовка ответа
app.use(function (req, res, next) {
    res.removeHeader("X-Powered-By");
    next();
});

app.get('/test', function (req, res) {
    res.send('API is running...');
});

app.get('/', function (req, res) {
    fs.readFile('./public/upload.html', function (err, data) {
        res.contentType('text/html');
        res.end(data);
    });
});

app.post('/', upl.any(), function (req, res) {
    let report = [];

    for (i = 0; i < req.files.length; i++) {
        report.push({
            originalName: req.files[i].originalname,
            storedName: req.files[i].filename,
            size: req.files[i].size,
            type: req.files[i].mimetype
        });
    }

    res.json(report);
});

app.get('/:fid([0-9a-f]{32})', function (req, res) {
    fs.readFile('./uploads/' + req.params.fid, function (err, data) {
        if (err) res.redirect('/404');
        res.end(data);
    });
});

app.get('/:fid([0-9a-f]{32})/check', function (req, res) {
    try {
        fs.accessSync('./uploads/' + req.params.fid, fs.constants.R_OK);
        res.json({
            status: 'OK',
            storedName: req.params.fid
        });
    }
    catch (err) {
        res.redirect('/404');
    }
});

app.post('/:fid([0-9a-f]{32})/copy', function (req, res) {
    let newname = uuid().toLowerCase().split('-').join('');
    fs.copyFile('./uploads/' + req.params.fid, './uploads/' + newname, fs.constants.COPYFILE_EXCL, function (err) {
        if (err) res.redirect('/500');
        res.json({
            status: 'OK',
            originalName: req.params.fid,
            storedName: newname
        });
    });
});

app.delete('/:fid([0-9a-f]{32})', function (req, res) {
    fs.unlink('./uploads/' + req.params.fid, function (err) {
        if (err) res.redirect('/404');
        //res.send('File ' + req.params.fid + ' deleted.');
        res.json({
            status: 'OK',
            originalName: req.params.fid
        });
    });
});

app.use(function(req, res){
    hlp.error(res, {
        code: 404,
        title: 'Not found URL',
        message: req.url
    });
});

app.use(function(req, res, next, err){
    hlp.error(res, {
        code: err.status || 500,
        title: 'Internal error',
        message: err.message
    });
});



app.listen(conf_data.http.port, function() {
    hlp.info({
        title: 'Сервер запущен',
        message : 'Сервер начал работу на порту ' + conf_data.http.port
    });
});

