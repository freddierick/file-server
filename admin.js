const express = require('express');
const app = express.Router();
const { query, mainConfig } = require('./index.js');
const { nanoid } = require('nanoid');
const bodyParser = require('body-parser');
const dirTree = require("directory-tree");
const multer  = require('multer');
const fetch  = require('node-fetch');
const fs = require('fs');

app.use(bodyParser.json())

app.use( async ( req,res,next ) => {
    console.log(req.session.user)
    if (req.session.user.admin == 0 || req.session.user.admin==null) return;
    next()
});

app.get("/node", async ( req,res ) => {
    if (req.query.update == "" ){
        console.log(req.query)
        const { node, url, name, newData } = req.query;
        if (node == "0"){
            if ( !name || !newData ) return res.status(403).send("missing type");
            console.log(name, newData)
        }
        if ( !node || !url || !name || !newData ) return res.status(403).send("missing type");
        let bucketUpdate;
        if (newData == "true") {bucketUpdate = 1 }  else {bucketUpdate = 0};
        await query("UPDATE nodes SET URL = ? , name = ? , newBuckets = ?  WHERE UID = ? ;",[url, name, bucketUpdate, parseInt(node)]);
    } else if (req.query.delete == "") {
        const { node } = req.query;
        if (!node) return res.status(403).send("missing type");
        await query("DELETE FROM nodes WHERE UID = ?;", [parseInt(node)]);
    } else if (req.query.create == "") {
        console.log("NEW NODE", req.query)
        const { name, url } = req.query;
        if ( !name || !url ) return res.status(403).send("missing type");
        let token = nanoid(100);
        let body = JSON.stringify({
            token,
            panelURL: mainConfig.panel.bace_url,
            baceURL: url
        });
        let nodeRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch( e =>{ return res.send({error: 'ERR/NO CONNE/ I Could not connect to that panel!'})})
        try{
            nodeRes = await nodeRes.json();
        }catch(e){
            return res.send({error: `This is not a FileStore Panel!`})
        }
        if (nodeRes.error) return res.send({error: `ERR/ ${nodeRes.error}`})
        if ( nodeRes.token == token ) {
            await query(`INSERT INTO nodes( name, URL,newBuckets, key) VALUES ( ? , ? , 1, ? );`,[name, url, token]);
            return res.send({});
        } else {
            return res.send({error: 'admin?nodeE=ERR/ There was an error while exchanging tokens! reset your node! '})
        }
    }
    return res.send()
});

app.get("/settings", async ( req,res ) => {
    mainConfig.panel.name = req.query.name;
    fs.writeFile('config.json', JSON.stringify(mainConfig), e => console.log);
    res.redirect('../../admin')
});

module.exports = { app };