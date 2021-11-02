const mongoose = require('mongoose'),
    Schema = mongoose.Schema;
const msg = require('./msg-helper');

mongoose.connect('mongodb://localhost/clubcorp')
    .then(() => msg.green('Connected to database'))
    .catch(err => msg.red('could not connect to the mongo db'));

const URLSchema = new mongoose.Schema({
    url: {
        type:String, 
        required: true,
        unique: true,
        index: true
    },
    type: String,
    created: {type: Date, default: Date.now},
    updated: {type: Date, default: Date.now}
});
const ClubCorpURL = mongoose.model('URL', URLSchema);

const EventSchema = new mongoose.Schema({
    url: {
        type: Schema.Types.ObjectId,
        ref: 'URL',
        index: true
    },
    onHTTPS: {type: Boolean, default: false},
    wwwMigrated: {type: Boolean, default: false},
    clubMigrated: {type: Boolean, default: false},
    redirect: {type: Boolean, default: false},
    longRedirect: {type: Boolean, default: false},
    infiniteRedirect: {type: Boolean, default: false},
    lowerCaseRedirect: {type: Boolean, default: false},
    valid: {type: Boolean, default: false},
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
    created: {type: Date, default: Date.now, index: true}
});

const ClubCorpEvent = mongoose.model('Event', EventSchema);

module.exports.ClubCorpURL = ClubCorpURL;
module.exports.ClubCorpEvent = ClubCorpEvent;