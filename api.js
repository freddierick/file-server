const express = require('express');
const app = express.Router();
const { query } = require('./index.js');
const { nanoid } = require('nanoid');
const bodyParser = require('body-parser');
const dirTree = require("directory-tree");
const multer  = require('multer');
const fetch  = require('node-fetch');
const fs = require('fs');


function validatePermissions(permissions){
    if (permissions.length > 2 || permissions.length < 1) return false;
    const validate = [false, false];
    for (let i = 0; i < 4; i++) {
        if (permissions[0] == i.toString()) validate[0] = true;
        if (permissions[1] == i.toString()) validate[1] = true; 
    };
    if (!validate[0] || !validate[1]) return false;
    return true;
};

function sanitizePath(path){ 
    if (!path) return;
    while (path.includes("%X98")){
        path = path.replace("%X98"," ");
    };
    while (path.includes("//")){
        path = path.replace("//","/");
    };
    while (path.includes("..")){
        path = path.replace("..","");
    };
    return path;
};

app.get("/key", async ( req,res ) => {
    if (!req.session.user.loggedIn) return res.redirect("../login");

    if (req.query.create == ""){
        if (!req.query.permissions || !req.query.name) return res.redirect("../dashboard?e=Missing type#API");
        if (!validatePermissions(req.query.permissions)) return res.redirect("../dashboard?e=Invalid perms#API");
        let keyExists = true;
        let key;
        while (keyExists){
            key = nanoid(40);
            rows = await query("SELECT * FROM apiKey WHERE key = ? ;", [key]);
            if (rows.length == 0 ) keyExists = false;
        };
        await query("INSERT INTO apiKey( key, name, permissions, owner ) VALUES ( ? , ? , ? , ? );", [key, req.query.name, req.query.permissions, req.session.user.UID]);


    } else if (req.query.delete == ""){
        if (!req.query.id) return res.redirect("../dashboard?e=Missing type#API");
        await query("DELETE FROM apiKey WHERE UID = ? AND owner = ? ;", [req.query.id ,req.session.user.UID]);
    }

    return res.redirect("../dashboard#API");
});

app.use( async (req,res,next)=>{
    let user;
    if (!req.headers['authorization']){
        if (!req.session.user.loggedIn) return res.status(403).send({error: "Bad or no auth"});
        user = req.session.user;
        user.permissions = "33";
        user.owner = user.UID.toString();
    };
    if (req.headers['authorization'] && !user){
        user = await query("SELECT * FROM apiKey WHERE key = ? ;", [req.headers['authorization']]);
        if (user.length == 0) return res.status(403).send({error: "Bad or no auth"});
        user = user[0]
    };
    req.user = user;
    next();
});

app.use(bodyParser.json())


//buckets
app.get("/bucket", async ( req,res ) => {
    if (parseInt(req.user.permissions[0]) < 1 ) return res.status(403).send({error: "This API key doesn't have permission to preform this action!"});
    buckets = await query("SELECT * FROM bucket WHERE owner = ? ;", [req.user.owner]);
    return res.send(buckets)
    //send list of buckets
});
app.post("/bucket", async ( req,res ) => {
    if (parseInt(req.user.permissions[0]) < 2 ) return res.status(403).send({error: "This API key doesn't have permission to preform this action!"});
    if (!req.body.name) return res.status(400).send({error: "Missing type"});
    await query("INSERT INTO bucket( name, owner ) VALUES ( ? , ? );", [req.body.name, req.user.owner]);
    return res.send({success: true});
    //create buckets
});
app.delete("/bucket", async ( req,res ) => {
    if (parseInt(req.user.permissions[0]) < 3 ) return res.status(403).send({error: "This API key doesn't have permission to preform this action!"});
    if (!req.query.id) return res.status(400).send({error: "Missing type"});
        owner = await query("SELECT * FROM bucket WHERE UID = ? AND owner = ? ;", [req.query.id ,req.user.owner]);
        await query("DELETE FROM bucket WHERE UID = ? AND owner = ? ;", [req.query.id ,req.user.owner]);
        if ( owner.length>0 ) {
            fs.rmdirSync(`./files/${req.query.id}`, { recursive: true });
            return res.send({success: true});
        } else {
            return res.status(403).send({error: "You don't own that bucket"});
        };

    //delete buckets
});
//\\buckets

//files
app.get("/files", async ( req,res ) => {
    if (parseInt(req.user.permissions[0]) < 1 ) return res.status(403).send({error: "This API key doesn't have permission to preform this action!"});
    let bucket = await query("SELECT * FROM bucket WHERE UID = ? AND owner = ? ;", [req.query.id, req.user.owner]);
    bucket = bucket[0];
    if (!bucket) return res.status(500).send({error: "No bucket found!"});

    if (!fs.existsSync(`./files/${req.query.id}`)) {
        fs.mkdirSync(`./files/${req.query.id}`);
    };
    // if (!fs.existsSync(`./files/${req.params.id}`)) return res.render("bucket.html", { files: {children:[]}, back: "/" });
    let files = dirTree(`./files/${req.query.id}`);
    files.children = files.children.sort(( a,b ) => (a.type == "directory" ? 0 : 1) - (b.type == "directory" ? 0 : 1) );
    return res.send(files)

    //send list of files
});
// app.use(bodyParser.urlencoded({ extended: false }));
app.post("/files/upload", async ( req,res, next ) => {
    if (parseInt(req.user.permissions[0]) < 2 ) return res.status(403).send({error: "This API key doesn't have permission to preform this action!"});
    if (!req.query.path || !req.query.bucket) return res.status(400).send({error: "Missing type"});

    req.query.path = sanitizePath(req.query.path);

    let bucket = await query("SELECT * FROM bucket WHERE UID = ? AND owner = ? ;", [req.query.bucket, req.user.owner]);

    bucket = bucket[0];
    if (!bucket) return res.status(500).send({error: "No bucket found!"});

    if (!req.query.path.startsWith("/")) req.query.path = "/"+ req.query.path;

    var storage = multer.diskStorage({
        destination: `./files/${req.query.bucket}${req.query.path}`,
        filename: function (req, file, cb) {
            cb(null, file.originalname);
        }
      })

    var upload = multer({dest: `./files/${req.query.bucket}${req.query.path}`, storage }).array('file');

    upload(req, res, function(err) {

        if (req.fileValidationError) {
            return res.send(req.fileValidationError);
        }
        // else if (!req.file) {
        //     return res.send({error: "No file uploaded!"});
        // }
        else if (err instanceof multer.MulterError) {
            return res.send(err);
        }
        else if (err) {
            return res.send(err);
        }
        if (req.query.web == "") return res.redirect(`../../../bucket/${req.query.bucket}?p=${req.query.path}`);
        return res.send({success: true});
    });
});

app.delete("/files", async ( req,res ) => {
    if (parseInt(req.user.permissions[0]) < 3 ) return res.status(403).send({error: "This API key doesn't have permission to preform this action!"});
    if (!req.query.path || !req.query.bucket) return res.status(400).send({error: "Missing type"});
    req.query.path = sanitizePath(req.query.path);
    if (!req.query.path.startsWith("/")) req.query.path = "/"+ req.query.path;
    let bucket = await query("SELECT * FROM bucket WHERE UID = ? AND owner = ? ;", [req.query.bucket, req.user.owner]);
    bucket = bucket[0];
    if (!bucket) return res.status(500).send({error: "No bucket found!"});
    if (bucket.nodeID == 0){
        if (!fs.existsSync(`./files/${req.query.bucket}${req.query.path}`)) {
            return res.status(400).send({error: "No file exists!"});
        };
        fs.rmdirSync(`./files/${req.query.bucket}${req.query.path}`, { recursive: true });
    } else {
        let node = await query("SELECT * FROM nodes WHERE UID = ? ;", [bucket.nodeID]);
        node = node[0];
        nodeFiles = await fetch(node.URL + `/bucket/delFile/${req.query.bucket}?path=${req.query.path}`, { method: 'GET', headers: { 'Content-Type': 'application/json', authorization: node.key }}).catch(e=> console.error);        
        if (typeof nodeFiles == "function"){
            return res.redirect('../../dashboard?e=This node is offline!')
        };
        nodeFiles = await nodeFiles.json();  
        return res.send(nodeFiles);
    };
    if (req.query.web == "") return res.redirect(`../../../bucket/${req.query.bucket}?p=${req.query.path}`);
    return res.send({success: true});
    //delete files
});
//\\files













app.get("*", ( req,res ) => {
    return res.send({message: "Welcome to freddie's file server API, the docks are available at: http://docs.freddie.pw/"});
});

module.exports = { app, sanitizePath };