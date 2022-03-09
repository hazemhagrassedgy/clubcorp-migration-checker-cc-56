const msg = require('./msg-helper'),
    models = require('./mongo-models',)
urlParser = require('url');

async function createURLIfNotExists(url) {
    const options = urlParser.parse(encodeURI(decodeURI(url)));
    const paths = options.path.split('/');
    const cluster = options.host + '-' + (paths.length ? paths[1] : '/');

    const oldURLs = await models.ClubCorpURL.find({ url: url });
    if (oldURLs.length) {
        oldURLs[0].type = 'HTML';
        oldURLs[0].cluster = cluster;
        oldURLs[0].host = options.host;
        oldURLs[0].path = options.path;
        oldURLs[0].query = options.query;
        oldURLs[0].updated = new Date();
        oldURLs[0] = await oldURLs[0].save();
        return oldURLs[0];
    }

    const ccURL = new models.ClubCorpURL({
        url: url,
        type: 'HTML',
        cluster: cluster,
        host: options.host,
        path: options.path,
        query: options.query,
        created: new Date(),
        updated: new Date()
    })
    let dbURL = null;
    try {
        dbURL = await ccURL.save(); //save method is used to store a document
    }
    catch (err) {
        msg.red(err)
    }
    return dbURL;
}
async function getURL(url) {
    const urls = await models.ClubCorpURL.find({ url: url });
    return urls.length ? urls[0] : null;
}
async function getURLLookup(url) {
    const urls = await models.URLLookup.find({ url: url });
    return urls.length ? urls[0] : null;
}
async function createURLLookup(row){
    let lookupURL = new models.URLLookup({
        url: row[2],
        page: row[1],
        created: new Date(),
        updated: new Date()
    });
    lookupURL = await lookupURL.save();
    return lookupURL;
}
async function updateURLLookup(lookupURL, row){
    lookupURL.page = row[1];
    lookupURL.updated = new Date();
    lookupURL = await lookupURL.save();
    return lookupURL;
}
async function getURLEvents(dbURL) {
    const events = await models.ClubCorpEvent.find({ url: dbURL._id }).populate('url').sort([['created', -1]]);
    return events ? events : [];
}
const getDateWithOffset = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(0);
    d.setSeconds(0);
    d.setMinutes(0);
    return d;
}
async function getURLRecentEvents(dbURL) {
    const todayDate = getDateWithOffset(0);
    const events = await models.ClubCorpEvent.find({ url: dbURL._id, created: { $gte: todayDate } }).populate('url').sort([['created', -1]]);
    return events ? events : [];
}

async function createURLEvent(args) {
    const dbURL = await models.ClubCorpURL.findOne({ url: args.url });
    dbURL.updated = new Date();

    let event = new models.ClubCorpEvent();
    event.url = dbURL;
    event.redirects = args.redirects;
    event.type = args.type;
    event.wwwMigrated = args.wwwMigrated;
    event.onHTTPS = args.onHTTPS;
    event.redirect = args.redirect;
    event.longRedirect = args.longRedirect;
    event.infiniteRedirect = args.infiniteRedirect;
    event.wwwMigrated = args.wwwMigrated;
    event.clubMigrated = args.clubMigrated;
    event.lowerCaseRedirect = args.lowerCaseRedirect;
    event.meta = { canonical: args.canonicalURL };
    event.error = args.error;
    event.created = new Date();

    event.valid = event.onHTTPS && event.lowerCaseRedirect && event.clubMigrated &&
        event.wwwMigrated && !event.longRedirect && !event.infiniteRedirect && event.meta.canonical !== '';

    try {
        await dbURL.save();
        event = await event.save(); //save method is used to store a document
    }
    catch (err) {
        msg.red(err)
    }
    return event;
}

async function clearURLLookup() {
    try {
        await models.URLLookup.deleteMany({});
        msg.green('Deleting old seed data');
    }
    catch (err) {
        msg.red(err)
    }
}
module.exports.createURLIfNotExists = createURLIfNotExists;
module.exports.createURLEvent = createURLEvent;
module.exports.getURLRecentEvents = getURLRecentEvents;
module.exports.getURLEvents = getURLEvents;
module.exports.getURL = getURL;
module.exports.getURLLookup = getURLLookup;
module.exports.createURLLookup = createURLLookup;
module.exports.updateURLLookup = updateURLLookup;
module.exports.clearURLLookup = clearURLLookup;
