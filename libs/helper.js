/**
 * Created by Kuznetsov on 13.09.2017.
 */

let winston = require('winston');

function getHelper (module) {
    // сохранение имени файла, для которого будут формироваться сообщения
    let path = module.filename.split('/').slice(-2).join('/');

    // создание экземпляра объекта Логгера
    let logger = new winston.Logger({
        transports : [
            new winston.transports.Console({
                colorize:   true,
                level:      'debug',
                label:      path,
                timestamp:  true
            })
        ]
    });

    return {
        /*
        getPath: function () {
            return path;
        },
        */

        /***
         * метод проверки наличия в объекте source полей, перечисленных в массиве names
         * @param source - объек, в котором проверяется наличие полей
         * @param names - массив имен полей, которые должны присутствовать в объекте source
         * @returns {boolean} - true, если все перечисленные в name поля присутствуют в объекте source, иначе - false
         */
        checkNames: function (source, names) {
            for (let i = 0; i < names.length; i++) {
                if (!(names[i] in source)) {
                    return false;
                }
            }
            return true;
        },

        /***
         * метод формирования информационного сообщения в журнале приложения
         * @param msg - объект, описывающий сообщение
         */
        info: function (msg) {
            logger.info((msg.title ? msg.title + '. ' : '') + (msg.message ? msg.message + '.' : ''));
        },

        /***
         * метод формирования сообщения об ошибке в журнале сообщения и отправки этого сообщения в ответ на входящий запрос
         * @param res - объект response, представляющий собой объект ответа для http запроса
         * @param err - объект, описывающий ошибку
         */
        error: function (res, err) {
            logger.error('%s %s %s %s',
                err.title ? err.title + '.' : '',
                err.message ? err.message + '.' : '',
                err.hint ? '(' + err.hint + ')' : '',
                err.data ? '[' + err.data + ']' : '');
            if ((res !== null) || (res !== undefined)) {
                res.status(err.code);
                res.json(err);
            }
        },

        /***
         * метод, формирующий стандартную ошибку авторизации пользователя
         * метод является оберткой метода error данного класса
         * @param res - объект response, представляющий собой объект ответа для http запроса
         */
        auth_error: function (res) {
            this.error(res, {
                code: 401,
                title: 'Ошибка авторизации',
                message: 'Пользователь не авторизован'
            });
        },

        /***
         * метод, формирующий стандартную ошибку параметоров для входящих http запросов
         * метод является оберткой метода error данного класса
         * @param res - объект response, представляющий собой объект ответа для http запроса
         * @param names - массив имен обязательных параметоров для входящего http запроса
         */
        params_error: function (res, names) {
            this.error(res, {
                code: 501,
                title: 'Ошибка входных параметров',
                message: (names.length > 1) ? 'Не указан один или несколько обязательных параметров' : 'Не указан обязательный параметр',
                data: names.join(', ')
            });
        },

        /***
         * метод, формирующий стандартную ошибку обращения к базе данных
         * метод является оберткой метода error данного класса
         * @param res - объект response, представляющий собой объект ответа для http запроса
         * @param req - объект request, содержащий данные входящего http запроса
         * @param db_err - объект, описывающий ошибку обращения к БД
         */
        db_error: function (res, req, db_err) {
            this.error(res, {
                code: 500,
                title: 'Ошибка БД',
                message: db_err.message,
                hint: db_err.hint,
                data: JSON.stringify(req.body)
            });
        }
    }
}

module.exports = getHelper;
