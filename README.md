# s3-poller

Fetch a JSON object from S3. Poll it for updates. Refetch it only if it has changed.

# Usage

Fairly self-documenting. See `index.js` comments for nitty-gritty. Here are the basics:

```javascript
const poller = new Poller({
	bucket: 'my-bucket',
	key: 'path/to/some.json'
});

poller.getCurrentValue(); // undefined
poller.getLastModified(); // undefined

await poller.getObject(); // fetch from S3
await poller.getObject(); // already cached; returns cached copy

assert(poller.getCurrentValue() === await poller.getObject());

poller.getLastModified(); // Date

await poller.getUpdate(); // fetch from S3, even if cached, but only if modified since last fetch

poller.onUpdate(listenerFunction, another, yetAnother, ...); // call you back when updates happen
poller.poll(60 * 60 * 1000); // check every hour

poller.offUpdate(another, yetAnother); // remove these listeners

poller.poll(2 * 60 * 60 * 1000); // change polling inteval, same listeners

poller.cancelPoll(); // stop polling, listeners stay registered

poller.removeListeners(); // remove all listeners
```

(`await` is ES7-speak for Promises. You don't need ES7, you can just use `.then()` etc.)

Useful constructor options:

* `bucket`, `key` - obvious, required
* `initialValue` - preset the interally cached value
* `lastModified` - preset the last modified date
* `updateInterval` - preset the update interval (ms), AND start polling immediately
* `updateListener` - add an update listener; you can give an array of listeners too
* `s3Config` - this gets passed into the `AWS.S3()` constructor call

This thing will barf if the object it receives isn't JSON. You can catch that error from `getObject()` or `getUpdate()`. Polling just discards the error for the time being.

# Legal

Copyright (c) 2016 Datanalytics, Inc. d/b/a Juristat.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at:

http://www.apache.org/licenses/LICENSE-2.0
