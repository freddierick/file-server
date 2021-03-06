const versionNumber = "0.1.2";


const sqlite3 = require('sqlite3');
const express = require('express');
const path = require('path');
const session = require('express-session');
const { nanoid } = require('nanoid');
const fs = require('fs');
const bcrypt = require('bcrypt');
const dirTree = require("directory-tree");
const fetch  = require('node-fetch');
const bodyParser = require('body-parser');
const cors = require('cors')


let mainConfig;
try{
    mainConfig = require('./config.json');
} catch(e){
}

const requestTokens = new Map();

setInterval(function(){ 
    
    Object.keys(requestTokens.keys()).forEach(token=>{
        if (Date.now() - requestTokens.get(token).created >(1000 * 60 *5)) requestTokens.delete(token);
    });
}, 5000);



const imagesJSON = require('./fileIcons.json');

const db = new sqlite3.Database("./data/data.db");

const query = ( (sql,params) => new Promise( (resolutionFunc,rejectionFunc) => {
    db.all(sql, params, (err, rows) => {
        if (err) {
            rejectionFunc(err);
        };
        resolutionFunc(rows);
        });
    })
);

module.exports = { query, mainConfig };

const api = require('./api').app;
const admin = require('./admin').app;
const { sanitizePath }  = require('./api');
const { json } = require('express');

const app = express(); 
const port = 80;
app.use(cors())
app.engine("html", require("ejs").renderFile);
app.set("view engine", "html");
app.use(session({
    secret: 'fghn5u904thg790453huyg7890543hj9g078453hg7894536jng9780453hg7980564hg7856',
  }))

app.listen(port, () => console.log(`Listening on port ${port}`));

if (!fs.existsSync(`./files`)) {
    fs.mkdirSync(`./files`);
};

(async()=>{
    await db.run(`CREATE TABLE IF NOT EXISTS user (
        UID INTEGER PRIMARY KEY,
        username text NOT NULL,
        admin INTEGER NOT NULL,
        email text NOT NULL,
        password text NOT NULL
    );`);

    await db.run(`CREATE TABLE IF NOT EXISTS bucket (
        UID INTEGER PRIMARY KEY,
        name text NOT NULL,
        nodeID INTEGER NOT NULL,
        public INTEGER NOT NULL,
        owner text NOT NULL,
        FOREIGN KEY (nodeID) REFERENCES nodes (UID),
        FOREIGN KEY (owner) REFERENCES user (UID)
    );`);

    await db.run(`CREATE TABLE IF NOT EXISTS apiKey (
        UID INTEGER PRIMARY KEY,
        key text NOT NULL,
        name text NOT NULL,
        permissions text NOT NULL,
        owner text NOT NULL,
        FOREIGN KEY (owner) REFERENCES user (UID)
    );`);

    await db.run(`CREATE TABLE IF NOT EXISTS nodes (
        UID INTEGER PRIMARY KEY,
        name text NOT NULL,
        URL text NOT NULL,
        newBuckets INTEGER NOT NULL,
        key text NOT NULL
    );`);

    // await db.run(`INSERT INTO nodes( name, URL,newBuckets, key) VALUES ('Node 1','https://freddie.host', 1, 'hjfguiodepgfhiudfhgvuiyrfe');`);
    // await db.run("INSERT INTO user(username, email, password, admin) VALUES ( ? , ? , ? , 1);", [username.toLowerCase(), email.toLowerCase(), hashedPassword]);


})();

let nodeData = {};  

setInterval(async function(){ 
    let nodes = await query("SELECT * FROM nodes;");
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!nodeData[node.UID]) nodeData[i] ={
            name: node.name,
            UID: node.UID,
            URL: node.URL,
            key: node.key,
            versionNumber: "0.0.0",
            lastFetch: Date.now(),
            lastResponse: Date.now(),
            online: true,
        };
        nodeData[i].lastFetch =  Date.now();
        // console.log(`${nodeData[i]}/status`)
        nodeRes = await fetch(`${nodeData[i].URL}/status`,{ headers: { 'Content-Type': 'application/json', authorization: nodeData[i].key }}).catch(e=>console.log)

        try{
            nodeRes = await nodeRes.json();
            // console.log(nodeRes, nodeData[i])
            if (nodeRes.status == "Ready and Waiting!") { nodeData[i].lastResponse = Date.now(); nodeData[i].online = true;nodeData[i].versionNumber = nodeRes.versionNumber}
        } catch (e) {console.log};
    }
    Object.keys(nodeData).map( node => { if(Date.now() - nodeData[node].lastResponse > 10000 ) nodeData[node].online = false; } );
    // console.log("\n\n\n\n\n\n\n\n\n\n",nodeData);
}, 5000);

class LoginSession {
    constructor(data){
        const { username, email, UID, admin } = data;
        this.username = username || null;
        this.email = email || null;
        this.UID = UID || null;
        this.admin = admin || null;
        this.loggedIn = !(!this.username);
    };
};

function genToken(user){
    token = nanoid(20);
    requestTokens.set(token, {user, created: Date.now()});
    return token;
};


app.use(bodyParser.urlencoded({ extended: false }));

app.use( async ( req,res,next ) => {
    if(!mainConfig && req.method == "GET") return res.render("firstStart.html", {mainConfig:{panel: { name: "FileStore"}}});
    if(!mainConfig && req.method == "POST") {
        const { type, username, email, password, panelURL } = req.body;
        if ( !type || !username || !email || !password || !panelURL ) return res.status(403).send("missing type");
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.run("INSERT INTO user(username, email, password, admin) VALUES ( ? , ? , ? , 1);", [username.toLowerCase(), email.toLowerCase(), hashedPassword]);
        mainConfig = {
            panel: {
                name: "FileStore",
                bace_url: panelURL,
                created: Date.now(),
                versionNumber,
            },
            built_in_node:{
                allowNewBuckets: 0,
                name: "Main"
            },
            allow_new_users: true,
        };
        fs.writeFile('config.json', JSON.stringify(mainConfig), e => console.log);
        return res.redirect('./login');
    };


    if (!req.session.user) req.session.user = new LoginSession(//{}
        {
        username: 'freddie',
        email: 'freddiewren@gmail.com',
        UID: 1,
        loggedIn: true,
        admin: 1,
      }
      );
    next();
});

app.use('/public', express.static('public'));

app.use("/api" ,api);

app.get("/nodeStatus", ( req,res ) => {
    if (!req.session.user.loggedIn) return res.redirect("./login");
    nodes = [];
    Object.keys(nodeData).map( node => nodes.push({ online: nodeData[node].online, UID: nodeData[node].UID, downSince: nodeData[node].lastResponse, versionNumber: nodeData[node].versionNumber  }) );
    res.send(nodes);
});

app.get("/", ( req,res ) => {
    if (!req.session.user.loggedIn) return res.redirect("./login");
    return res.redirect("./dashboard");
});

app.get("/login", ( req,res ) => {
    if (!req.session.user.loggedIn) return res.render("login.html", {error:"" , mainConfig});
    return res.redirect("./dashboard");
});

app.get("/register", ( req,res ) => {
    if (!req.session.user.loggedIn) return res.render("register.html", {error:"", mainConfig});
    return res.redirect("./dashboard");
});

app.get("/logout", ( req,res ) => {
    req.session.user = new LoginSession({});
    return res.redirect("./login");
});


app.post("/auth", async ( req,res ) => {
    const { type, username, email, password } = req.body;
    if ( !type || !password || !username ) return res.status(403).send("missing type");
    if (type == "login"){
        let exists = await query("SELECT * FROM user WHERE username = ? OR email = ?;", [username.toLowerCase(), username.toLowerCase()]);
        if (exists[0]) {
            correctPass = await bcrypt.compare(password, exists[0].password);
            if (!correctPass) return res.redirect("./login?e=bad account info");
            req.session.user = new LoginSession(exists[0]);
            return res.redirect("./dashboard");
        };
        return res.redirect("./login?e=no account");
    } else if (type == "register"){
        if ( !email ) return res.status(403).redirect("./login?e=missing type");
        console.log([username, email])
        let exists = await query("SELECT * FROM user WHERE username = ? OR email = ?;", [username.toLowerCase(), email.toLowerCase()]);
        if (!(!exists[0])) {
            return res.status(403).redirect("./register?e=existing account");
        };
        console.log(exists)
        const hashedPassword = await bcrypt.hash(password, 10);
        e = await db.run("INSERT INTO user(username, email, password, admin) VALUES ( ? , ? , ? , 0 );", [username.toLowerCase(), email.toLowerCase(), hashedPassword]);
        const user = await query("SELECT * FROM user WHERE username = ? OR email = ?;", [username.toLowerCase(), email.toLowerCase()]);
        req.session.user = new LoginSession(user[0]);
        return res.redirect("./dashboard");
    } else {
        return res.status(403).redirect("./login?e=missing type");
    };
});


app.get("/dashboard", async ( req,res ) => {
    if (!req.session.user.loggedIn) return res.redirect("./login");
    const buckets = await query("SELECT * FROM bucket WHERE owner = ? ;", [req.session.user.UID]);
    const apiKeys = await query("SELECT * FROM apiKey WHERE owner = ? ;", [req.session.user.UID]);
    const nodes = await query("SELECT * FROM nodes;");
    const availableNodes = nodes.filter(node => node.newBuckets == 1);
    return res.render("dashboard.html", { buckets, apiKeys, user: req.session.user, mainConfig, availableNodes, nodes, query: req.query });
});

app.get("/admin", async ( req,res ) => {
    if (!req.session.user.loggedIn) return res.redirect("./login");
    if (req.session.user.admin == 0 || !req.session.user.admin) return res.redirect("./dashboard");
    const buckets = await query("SELECT * FROM bucket;");
    const nodes = await query("SELECT * FROM nodes;");
    const users = await query("SELECT * FROM user;");
    return res.render("admin.html", { buckets, nodes, user: req.session.user, mainConfig, query:req.query, users });
});
app.use("/admin" ,admin);

app.get("/bucket", async ( req,res ) => {
    if (!req.session.user.loggedIn) return res.redirect("./login");


    if (req.query.create == ""){
        if (!req.query.name, !req.query.node) return res.redirect("./dashboard?e=Missing type");
        if (req.query.node == "main") req.query.node = "0";
        await query("INSERT INTO bucket( name, owner, public, nodeID ) VALUES ( ? , ? , 0 , ? );", [req.query.name, req.session.user.UID, parseInt(req.query.node)]);

    } else if (req.query.public == ""){
        if (!req.query.id) return res.redirect("./dashboard?e=Missing type");
        bucket = await query("SELECT * FROM bucket WHERE UID = ? AND owner = ? ;", [req.query.id ,req.session.user.UID]);
        if (bucket[0]==null ) return res.redirect("./dashboard?e=Bucket not found");
        await query("UPDATE bucket SET public = ? WHERE UID = ? AND owner = ? ;", [bucket[0].public==0 ? 1 : 0 ,req.query.id ,req.session.user.UID]);
        return res.send({success: true});




    } else if (req.query.delete == ""){
        if (!req.query.id) return res.redirect("./dashboard?e=Missing type");
        let bucket = await query("SELECT * FROM bucket WHERE UID = ? AND owner = ? ;", [req.query.id ,req.session.user.UID]);

        if ( bucket.length > 0 ) {
            if (bucket[0].nodeID != 0){
                let node = await query("SELECT * FROM nodes WHERE UID = ? ;", [bucket[0].nodeID]);
                node = node[0];
                nodeFiles = await fetch(node.URL+`/bucket/delete?id=${req.query.id}`, { method: 'get', headers: { 'Content-Type': 'application/json', authorization: node.key }}).catch(e=> console.error)
                if (typeof nodeFiles == "function"){
                    return res.redirect('../../dashboard?e=This node is offline!')
                }
                nodeFiles = await nodeFiles.json();
                if(nodeFiles.error) return res.redirect("../dashboard?e=You cant delete a bucket whilst it has files in it!");
            } else {
                if(dirTree(`./files/${req.query.id}`).children.length !=0) return res.redirect("../dashboard?e=You cant delete a bucket whilst it has files in it!");
                fs.rmdirSync(`./files/${req.query.id}`, { recursive: true });
            }
            await query("DELETE FROM bucket WHERE UID = ? AND owner = ? ;", [req.query.id ,req.session.user.UID]);
            return res.redirect(`../dashboard?s=Successfully deleted bucket: ${bucket[0].name}`);
        }





    } else if (req.query.createDir == ""){
        if (!req.query.name || !req.query.path || !req.query.id ) return res.redirect("../dashboard?e=Missing type");
        req.query.path = sanitizePath(req.query.path);
        let bucket = await query("SELECT * FROM bucket WHERE UID = ? AND owner = ? ;", [req.query.id, req.session.user.UID]);
        console.log(bucket)
        bucket = bucket[0];
        if (!bucket) return res.redirect("./dashboard");
        if (bucket.nodeID == 0){
            try{
                fs.mkdirSync(`./files/${req.query.id}${req.query.path}/${req.query.name}`);
            } catch (e){
                return res.redirect(`../bucket/${req.query.id}?p=${req.query.path}&e=Dir all ready exists`);
            }
            return res.redirect(`../bucket/${req.query.id}?p=${req.query.path}`);
        };

        let node = await query("SELECT * FROM nodes WHERE UID = ? ;", [bucket.nodeID]);
        node = node[0];
        nodeFiles = await fetch(node.URL + `/bucket/createDir/${req.query.id}?path=${req.query.path}&name=${req.query.name}`, { method: 'GET', headers: { 'Content-Type': 'application/json', authorization: node.key }}).catch(e=> console.error);        
        if (typeof nodeFiles == "function"){
            return res.redirect('../../dashboard?e=This node is offline!')
        };
        nodeFiles = await nodeFiles.json();
        if (nodeFiles.error) res.redirect(`../bucket/${req.query.id}?p=${req.query.path}&e=Dir all ready exists`);
        return res.redirect(`../bucket/${req.query.id}?p=${req.query.path}`);

    };


    return res.redirect("../dashboard");
});

app.get("/bucket/:id", async ( req,res ) => {
    if (!req.session.user.loggedIn) return res.redirect("./login");
    let bucket = await query("SELECT * FROM bucket WHERE UID = ? AND owner = ? ;", [req.params.id, req.session.user.UID]);

    bucket = bucket[0];
    if (!bucket) return res.redirect("./dashboard");
    const path = sanitizePath(req.query.p);
    if (!path) return res.redirect(`./${req.params.id}?p=/`);
    let files;
    let node = await query("SELECT * FROM nodes WHERE UID = ? ;", [bucket.nodeID]);
    if (bucket.nodeID ==0){
        if (!fs.existsSync(`./files/${req.params.id}`)) {
            fs.mkdirSync(`./files/${req.params.id}`);
        };
        if (!fs.existsSync(`./files/${req.params.id}${path}`)) return res.render("bucket.html", { files: {children:[]}, back: "/", path:"/", bucketID: req.params.id, mainConfig, token: genToken(req.session.user.UID) });
        files = dirTree(`./files/${req.params.id}${path}`);
    } else {
        
        node = node[0];
        nodeFiles = await fetch(node.URL+`/bucket/${req.params.id}?path=${path}`, { method: 'get', headers: { 'Content-Type': 'application/json', authorization: node.key }}).catch(e=> console.error)
        if (typeof nodeFiles == "function"){
            return res.redirect('../../dashboard?e=This node is offline!')
        }
        nodeFiles = await nodeFiles.json();
        files = nodeFiles.files;
    };
    



    files.children = files.children.sort(( a,b ) => (a.type == "directory" ? 0 : 1) - (b.type == "directory" ? 0 : 1) );
    let back = path.split("/");
    back.pop();back.shift();
    back = back.length == 0 ? "/" :   "/"+back.join("/"); 
    files.children.forEach((e,i)=>{
        let size;
        if (!(e.size > 1000)){
            size = Math.floor(e.size) + " B";
        } else if (!(e.size / 1024 > 1000)){
            size = Math.floor(e.size / 1024) + " KB";
        } else if (!(e.size / 1024 / 1024 > 1000)){
            size = Math.floor(e.size / 1024 / 1024) + " MB";
        } else if (!(e.size / 1024 / 1024 / 1024 > 1000)){
            size = Math.floor(e.size / 1024 / 1024 / 1024) + " GB";
        };
        e.size = size;
        let file = imagesJSON['generalFile'];
        if (e.type == 'directory'){
            file = imagesJSON['folder'];
        } else {
            imagesJSON.specifics.forEach(image => {
                if (image.extensions.includes(e.extension)) file = image.icon;
            });
        };
        files.children[i].image = file;
    });
    let myUrl;
    if (node) {myUrl = node.URL}
    else myUrl = mainConfig.panel.bace_url
    return res.render("bucket.html", { files, path, bucketID: req.params.id, back, myUrl, user:req.session.user, mainConfig, token: genToken(req.session.user.UID)});
});

app.get("/bucket/download/:id*", async ( req,res,next ) => {
    // if (!req.session.user.loggedIn) return res.redirect("../../../login");
    let bucket = await query("SELECT * FROM bucket WHERE UID = ?;", [req.params.id]);
    bucket = bucket[0];
    if (!bucket)  return res.redirect("../../../dashboard");

    

    if (bucket.nodeID != 0){
        let node = await query("SELECT * FROM nodes WHERE UID = ? ;", [bucket.nodeID]);
        node = node[0];
        filePath = req.path.replace(`/bucket/download/${req.params.id}/`,"");
        let token;

        if (req.session.user) {token = "?key="+genToken(req.session.user.UID)}
        
        return res.redirect(`${node.URL}/bucket/download/${req.params.id}/${filePath}${token}`);
    };
    if (bucket.public == 0 && bucket.owner != req.session.user.UID) return res.redirect("../../../dashboard");
    next();
});
app.use('/bucket/download', express.static('files'));


app.use(bodyParser.json())


app.post("/node/checkPerms", async ( req,res ) => {
    req.body = JSON.parse(req.headers.body);
    if (!req.headers["authorization"]) return res.send({error: "No Auth"});
    let node = await query("SELECT * FROM nodes WHERE key = ? ;", [req.headers["authorization"]]);
    if (node.length == 0 ) return res.send({error: "Bad Auth"});
    let bucket = await query("SELECT * FROM bucket WHERE UID = ? ;", [req.body.bucket]);
    if (bucket.length == 0 ) return res.send({error: "No Bucket"});
    if (bucket[0].public == 1 && req.body.for == "download") return res.send({ permission: true });
    let userAuth = requestTokens.get(req.body.key);
    if (!userAuth) return res.send({ permission: false });
    if (bucket[0].owner == userAuth.user) return res.send({ permission: true });
    return res.send({ permission: false });
});

app.get("*", ( req,res ) => {
    return res.status(404).render("./404.html", {user:req.session.user, mainConfig });
});
