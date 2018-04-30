const config = require('chen.js').config.resolve();
const minvk = require('minvk');
const request = require('./async-request');
const tmp = require('tmp-promise');
const fs = require('fs');
const Path = require('path');
const util = require('util');
const writeFile = util.promisify(fs.writeFile);
const exec = require('./exec');

const vk = new minvk.community(config.api);

console.log(config);

(async () => {
    await vk.init();
    console.log(vk.account_type);
    //vk.on('message_new', ({user_id, body}) => vk.call('messages.send', {user_id, message: body}));
    vk.on('message_new', async (msg) => {
        const {user_id} = msg;
        await vk.call('messages.send', {user_id, message: "Starting..."});

        if(msg.attachments){
            await vk.call('messages.send', {user_id, message: "Downloading attachments..."});

            const {path} = await tmp.file({postfix: '.md'});
            const {base, dir, name} = Path.parse(path);
            console.log(path, base);
            const content = await Promise.all(
                    msg.attachments
                    .filter(({type}) => type === 'doc')
                    .filter(({doc: {size}}) => size < 1024 * 1024 * 5)
                    .sort((a, b) => a.doc.title > b.doc.title)
                    .map(({doc: {url}}) => url)
                    .slice(0,20)
                    .map(url => request(url))
                );
            await vk.call('messages.send', {user_id, message: "Saving attachments..."});

            await writeFile(path, content);

            await vk.call('messages.send', {user_id, message: "Executing patchouli..."});

            const _ = await exec(`cd ${dir} && patchouli --type=pdf ${base}`);

            await vk.call('messages.send', {user_id, message: `Done!\nStdout:\n${_.stdout}\n\nStderr:\n${_.stderr}`});

            const res_path = `${dir}/${name}.pdf`;
            if(!fs.existsSync(res_path)){
                await vk.call('messages.send', {user_id, message: `No results!`});
                return;
            }
            console.log("0");
            await vk.call('messages.send', {user_id, message: `Uploading results...`});
            console.log("1");
            console.log("2");
            const {upload_url} = await vk.call("docs.getMessagesUploadServer", {type: "doc", peer_id: user_id});
            console.log("3");
            await vk.call('messages.send', {user_id, message: `Got upload url`});

            try{
                let data = await request(upload_url, {
                    method: "POST",
                    formData: {
                        file: fs.createReadStream(res_path)
                    }
                });
                const {file} = JSON.parse(data);

                await vk.call('messages.send', {user_id, message: `Uploaded file ${file}`});

                const [{id, owner_id, url}]= await vk.call('docs.save', {file});
                console.log("FILE", id, owner_id, url, {attachment: `doc${owner_id}_${id}`});
                await vk.call('messages.send', {
                    user_id,
                    message: `Result`,
                    attachment: `doc${owner_id}_${id}`
                });
            }
            catch(e){
                await vk.call('messages.send', {user_id, message: `Failed to upload file!`});
            }
        }
    });
})();

process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
});