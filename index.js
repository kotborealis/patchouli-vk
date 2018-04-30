const config = require('chen.js').config.resolve();
const minvk = require('minvk');
const request = require('./async-request');

const vk = new minvk.community(config.api);

console.log(config);

(async () => {
    await vk.init();
    console.log(vk.account_type);
    //vk.on('message_new', ({user_id, body}) => vk.call('messages.send', {user_id, message: body}));
    vk.on('message_new', (msg) => console.log(msg.attachments[0]));
    vk.on('message_new', async (msg) => {
        if(msg.attachments){
            const files = await Promise.all(
                    msg.attachments
                    .filter(({type}) => type === 'doc')
                    .filter(({doc: {size}}) => size < 1024 * 1024 * 5)
                    .map(({doc: {url}}) => url)
                    .map(url => request(url))
                );
            console.log("GOT FILES", files);
        }
    });
})();

process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
});