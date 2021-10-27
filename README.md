# clubcorp-migration-checker-cc-56

URL Redirect Checker is a nodejs script file that takes a CSV file (List of URLs) and make sure that the URLs are valid based on the details in the following JIRA ticket https://edgylabs.atlassian.net/browse/CC-56


### Installation

The app requires [Node.js](https://nodejs.org/) v8+ to run.

Install the dependencies and devDependencies and start the app.

```sh
$ cd clubcorp-migration-checker-cc-56
$ npm install
```

### Running

Ubuntu & MAC:

```sh
$ node run.js --data=data/sample.csv
```
Windows:

```sh
$ node run.js --data=data\sample.csv
```