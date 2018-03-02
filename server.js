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
    uuid = require('uuid/v4'),
    JSZip = require('jszip'),
    _ = require('underscore');

let config = require('./config.json');

let upl = multer({ dest : config.storageDir});

let app = express();


logger.token('size', (req, res) => {
    let l = res._contentLength,
        ls = '';
    if (l < 1024) ls = l + ' B';
    else if (l < 1048576) ls = Math.ceil(l / 1024) + ' KB';
    else ls = Math.ceil(l / 1048576) + ' MB';
    return ls;
});
logger.token('remote-ip', (req) => {
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


// подавление запроса иконки
app.get('/favicon.ico', (req, res) => {
    res.status(204);
});

// удаление тега X-Powered-By из заголовка ответа
app.use((req, res, next) => {
    res.removeHeader("X-Powered-By");
    next();
});

// тестовый запрос проверки работы сервиса
app.get('/test', (req, res) => {
    res.send('API is running...');
});

// запрос формы передачи файлов
app.get('/', (req, res) => {
    fs.readFile('./public/upload.html', (err, data) => {
        res.type('html').end(data);
    });
});

// сохранение файла(ов) в хранилище
// сохраняемые файлы отправляются в форме (multipart/form-data) в поле downloaded_file
// сохранение файлов производится автоматически методом multer.any(), который создает
// в объекте запроса (req) массив files, содержащий информацию по всем сохраненным файлам
app.post('/', upl.any(), (req, res) => {
    let report = [];

    if (!('files' in req)) {
        res.status(500).send('No files for saving in storage');
        return;
    }

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

// получение указанного файла из хранилища
app.get('/:fid([0-9a-f]{32})', (req, res) => {
    fs.readFile(config.storageDir + req.params.fid, (err, data) => {
        // в случае ошибки возвращается статус 404 (not found)
        if (err) res.status(404).end();
        else res.end(data);
    });
});

// проверка существования файла в хранилище
app.get('/:fid([0-9a-f]{32})/check', (req, res) => {
    fs.access(config.storageDir + req.params.fid, fs.constants.R_OK, (err) => {
        // в случае ошибки возвращается статус 404 (not found)
        if (err) res.status(404).end();
        // если файл существует, возвращается статус 200 (ОК)
        else res.status(200).end();
    });
});

// создание копии указанного файла
app.post('/:fid([0-9a-f]{32})/copy', (req, res) => {
    let newname = uuid().toLowerCase().split('-').join('');
    fs.copyFile(config.storageDir + req.params.fid, config.storageDir + newname, fs.constants.COPYFILE_EXCL, (err) => {
        if (err) res.status(404).end();
        else
            res.json({
                status: 'OK',
                originalName: req.params.fid,
                storedName: newname
            });
    });
});

// удаление файла из хранилища
app.delete('/:fid([0-9a-f]{32})', (req, res) => {
    fs.unlink(config.storageDir + req.params.fid, (err) => {
        if (err) res.status(404).end();
        else res.status(200).end();
    });
});

// формирование zip-архива на основании переданной структуры
// в теле запроса передается json-объект вида:
// {
//     "files": [
//         {
//             "storedName": <уникальное имя файла в хранилище>,
//             "fileName": <имя файла в архиве с учетом структуры каталогов>
//         }
//     ]
// }
app.post('/makezip', (req, res) => {
    let struc = req.body;

    /* проверка переданной структуры */

    if (!('files' in struc) || (struc.files.length === 0)) {
        res.status(500).send('No files for packing');
        return;
    }

    for (let i = 0; i < struc.files.length; i++) {
        // проверка существования сохраненного файла
        try {
            fs.accessSync(config.storageDir + struc.files[i].storedName, fs.constants.R_OK);
        }
        catch (err) {
            // в случае ошибки вернуть код 404 и имя файла
            res.status(404).send('File ' + struc.files[i].storedName + ' not found');
            return;
        }

        // имя файла, помещаемого в архив, должно быть определено
        if ((struc.files[i].fileName || '') === '') {
            res.status(500).send('Zipped file name not defined (for stored file ' + struc.files[i].storedName + ')');
            return;
        }
    }

    /* формирование zip-архива */
    // создание объект архива
    let zip = new JSZip();
    // для каждого файла, описанного во входной структуре...
    for (let i = 0; i < struc.files.length; i++) {
        // прочитать содержимое сохраненного файла
        let cont = fs.readFileSync(config.storageDir + struc.files[i].storedName);
        // записать файл в архив с указанным именем
        zip.file(struc.files[i].fileName, cont, {binary: true});
    }
    // формирование файла архива
    zip.generateAsync({type:"uint8array"})
        .then((content) => {
            // генерация уникального имени для созданного архива
            let zipname = uuid().toLowerCase().split('-').join('');
            // запись файла в хранилище
            fs.writeFile(config.storageDir + zipname, content, (err) => {
                // в случае ошибки в процессе записи файла вернуть код 500 и содержимое ошибки
                if (err) res.status(500).end(err);
                else
                    // в случае успеха вернуть имя сохраненного файла
                    res.json({
                        status: 'OK',
                        storedName: zipname
                    });
            });
        });
});

// очистка хранилища
// для работы метода на вход необходимо передать массив имен используемых файлов
//
// по умолчанию, метод выполняет диагностику хранилища и возвращает json-объект, содержащий два массива:
//   toclear - имена файлов подлежащих удалению
//   notfound - имена файлов из входного массива, которые не были найдены в хранилище
//
// если при вызове метода в запросе указать параметр "deleteunusedfiles", метод выполнит удаление неиспользуемых файлов
// в результате этой операции неиспользуемые файлы будут физически удалены и метод вернет json-объект, содержащий два
// поля:
//   deleted - количество удаленных файлов
//   notfound - массив имен файлов из входного массива, которые не были найдены в хранилище
app.post('/clean', (req, res) => {
    let data = req.body;

    // проверка входных данных
    if (!Array.isArray(data)) {
        res.status(500).send("Array of string required");
        return;
    }

    // если на входной массив пустой
    if (data.length === 0) {
        // завершить работу
        res.status(200).end();
        return;
    }

    // служебные объекты для работы с именами файлов
    let toclear = {}, master = {};

    //
    for (let i = 0; i < data.length; i++)
        master[data[i]] = true;

    // чтение содержимого каталога файлового хранилища
    fs.readdir(config.storageDir, (err, files) => {
        // для каждого файла из хранилища...
        for (let i = 0; i < files.length; i++) {
            // проверяется нахождение его имени в списке имен используемых файлов
            if (files[i] in master)
                // если файл из хранилища найден в списке используемых, никаких операций с ним производить не нужно
                delete master[files[i]];
            else
                // если файл с списке используемых не найден, нужно включить его в список на удаление
                toclear[files[i]] = true;
        }

        // если в запросе указан флаг физического удаления неиспользуемых файлов...
        if ('deleteunusedfiles' in req.query) {
            // счетчик удаленных файлов
            let counter = 0;
            // перебор полей объекта
            for (fn in toclear) {
                try {
                    // синхронное удаление файла
                    fs.unlinkSync(config.storageDir + fn);
                    counter++;
                }
                catch (err) {
                    // в случае ошибки вернуть код 500 и имя файла
                    res.status(500).end('Can not delete file ' + fn);
                    break;
                }
            }

            // подготовка и отправка результов работы
            res.json({
                deleted: counter,
                notfound: _.keys(master)
            });
        }
        else
            // подготовка и отправка диагностического отчета
            res.json({
                toclear: _.keys(toclear),
                notfound: _.keys(master)
            });
    });
});

// обработка ошибочных запросов
app.use((req, res) => {
    hlp.error(res, {
        code: 404,
        title: 'Not found URL',
        message: req.url
    });
});

// обработка общих ошибок сервиса
app.use((req, res, next, err) => {
    hlp.error(res, {
        code: err.status || 500,
        title: 'Internal error',
        message: err.message
    });
});



app.listen(config.port, function() {
    hlp.info({
        title: 'Сервер запущен',
        message : 'Сервер начал работу на порту ' + config.port
    });
});

