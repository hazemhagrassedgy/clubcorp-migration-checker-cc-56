const msg = require('./msg-helper'),
    models = require('./mongo-models');

async function createURLIfNotExists(url) {
    const oldURLs = await models.ClubCorpURL.find({ url: url });
    if (oldURLs.length) {
        return oldURLs[0];
    }

    const ccURL = new models.ClubCorpURL({
        url: url,
        type: 'HTML',
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
async function getURLEvents(dbURL) {
    const events = await models.ClubCorpEvent.find({ url: dbURL._id }).populate('url').sort([['created', -1]]);
    return events ? events : [];
}
async function getURLRecentEvents(dbURL) {
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    yesterdayDate.setHours(0);
    yesterdayDate.setSeconds(0);
    yesterdayDate.setMinutes(0);

    const events = await models.ClubCorpEvent.find({ url: dbURL._id, created: { $gt: yesterdayDate } }).populate('url').sort([['created', -1]]);
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
module.exports.createURLIfNotExists = createURLIfNotExists;
module.exports.createURLEvent = createURLEvent;
module.exports.getURLRecentEvents = getURLRecentEvents;
module.exports.getURLEvents = getURLEvents;
module.exports.getURL = getURL;
