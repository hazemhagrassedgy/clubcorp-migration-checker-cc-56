const mongoose = require('mongoose'),
    Schema = mongoose.Schema;
const urlParser = require('url');
const msg = require('./msg-helper');

mongoose.connect('mongodb://localhost/clubcorp')
    .then(() => msg.green('Connected to database'))
    .catch(err => msg.red('could not connect to the mongo db'));

const URLLookupSchema = new mongoose.Schema({
    url: {
        type: String,
        unique: true,
        index: true
    },
    page: String,
    created: { type: Date, default: Date.now },
    updated: { type: Date, default: Date.now }
});
URLLookupSchema.methods.isClubCorpPageHost = function() {
    const options = urlParser.parse(encodeURI(decodeURI(this.page)));
    return options.host.isClubCorpHost();
};
URLLookupSchema.methods.isClubCorpPageClubHost = function() {
    const options = urlParser.parse(encodeURI(decodeURI(this.page)));
    return options.host.isClubCorpClubHost();
};

const URLLookup = mongoose.model('URLLookup', URLLookupSchema);


const URLSchema = new mongoose.Schema({
    url: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    type: String,
    path: String,
    host: String,
    query: String,
    cluster: String,
    created: { type: Date, default: Date.now },
    updated: { type: Date, default: Date.now }
});
URLSchema.methods.isClubCorpHost = function() {
    return this.host.isClubCorpHost();
}
URLSchema.methods.isClubCorpClubHost = function() {
    return this.host.isClubCorpClubHost();
}

const ClubCorpURL = mongoose.model('URL', URLSchema);

const EventSchema = new mongoose.Schema({
    url: {
        type: Schema.Types.ObjectId,
        ref: 'URL',
        index: true
    },
    onHTTPS: { type: Boolean, default: false },
    wwwMigrated: { type: Boolean, default: false },
    clubMigrated: { type: Boolean, default: false },
    redirect: { type: Boolean, default: false },
    longRedirect: { type: Boolean, default: false },
    infiniteRedirect: { type: Boolean, default: false },
    lowerCaseRedirect: { type: Boolean, default: false },
    valid: { type: Boolean, default: false },
    meta: {
        canonical: String
    },
    type: String,
    redirects: [{
        url: String,
        status: String,
        error: String
    }],
    error: String,
    created: { type: Date, default: Date.now, index: true }
});

const ClubCorpEvent = mongoose.model('Event', EventSchema);

module.exports.ClubCorpURL = ClubCorpURL;
module.exports.URLLookup = URLLookup;
module.exports.ClubCorpEvent = ClubCorpEvent;