const config = require('chen.js').config.resolve();
const minvk = require('minvk');
const request = require('./async-request');
const Request = require('request');
const tmp = require('tmp-promise');
const fs = require('fs');
const Path = require('path');
const util = require('util');
const writeFile = util.promisify(fs.writeFile);
const exec = require('./exec');
const unzip = require('unzip');
const Readable = require('stream').Readable;

const vk = new minvk.community(config.api);

(async () => {
    await vk.init();
    vk.on('message_new', async (msg) => {
        const {user_id} = msg;

        await vk.call('messages.send', {user_id, message: "Starting..."});

        if(msg.attachments){
            if(msg.attachments[0].doc.ext === 'zip'){
                await processZip(msg, user_id);
            }
            else{
                await processMarkdownFiles(msg, user_id);
            }
        }
    });
})();

const processZip = async(msg, user_id) => {
    await vk.call('messages.send', {user_id, message: "Downloading zip..."});
    const {path: dir} = await tmp.dir();

    await vk.call('messages.send', {user_id, message: "Extracting zip..."});
    await new Promise((resolve, reject) => {
        const fd = Request(msg.attachments[0].doc.url);
        fd.pipe(unzip.Extract({path: dir}))
        fd.on('end', resolve)
            .on('finish', resolve)
            .on('error', reject)
    });
    await vk.call('messages.send', {user_id, message: "Done..."});

    await vk.call('messages.send', {user_id, message: "Executing patchouli..."});
    const _ = await exec(`cd ${dir} && patchouli --type=pdf --concat=build.md`);
    await vk.call('messages.send', {user_id, message: `Done!\nStdout:\n${_.stdout}\n\nStderr:\n${_.stderr}`});
    await uploadResult(user_id, `${dir}/build.pdf`);
};

const processMarkdownFiles = async (msg, user_id) => {
    await vk.call('messages.send', {user_id, message: "Downloading markdown files..."});
    const {path} = await tmp.file({postfix: '.md'});
    const {base, dir, name} = Path.parse(path);
    const content = await Promise.all(
        msg.attachments
            .filter(({type}) => type === 'doc')
            .filter(({doc: {size}}) => size < 1024 * 1024 * 5)
            .sort((a, b) => a.doc.title > b.doc.title)
            .map(({doc: {url}}) => url)
            .slice(0,20)
            .map(url => request(url))
    );
    await vk.call('messages.send', {user_id, message: "Saving bundle..."});
    await writeFile(path, content);
    await vk.call('messages.send', {user_id, message: "Executing patchouli..."});
    const _ = await exec(`cd ${dir} && patchouli --type=pdf ${base}`);
    await vk.call('messages.send', {user_id, message: `Done!\nStdout:\n${_.stdout}\n\nStderr:\n${_.stderr}`});
    await uploadResult(user_id, `${dir}/${name}.pdf`);
};

const uploadResult = async (user_id, res_path) => {
    if(!fs.existsSync(res_path)){
        await vk.call('messages.send', {user_id, message: `No results!`});
        return;
    }
    await vk.call('messages.send', {user_id, message: `Uploading results...`});
    const {upload_url} = await vk.call("docs.getMessagesUploadServer", {type: "doc", peer_id: user_id});
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
        await vk.call('messages.send', {
            user_id,
            message: `Result`,
            attachment: `doc${owner_id}_${id}`
        });
    }
    catch(e){
        await vk.call('messages.send', {user_id, message: `Failed to upload file!`});
    }
};

process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
});