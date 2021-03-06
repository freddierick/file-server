# File Store
This is a file server that works like a cloud storage solution. You can upload and download files; browse directories.
# Setup
Clone the repo into a directory  and run
### `npm i`
or
### `yarn`
After that navigate to the port the server booted on, you will be greeted by a first-time setup screen. Complete the registration then you can create buckets and upload files!
Now you can start adding nodes so you can store your data across multiple physical servers. You can find the files for creating nodes [here](https://github.com/freddierick/file-store-node).

# Buckets
Buckets allow you to create a collection of files and directories that are independent of each other.
# Accounts 
Accounts make sure only the user who uploaded the files have access to them however, you can make a bucket public so anyone on the internet can access them (could be used for web hosting).
# API
You can create API keys with different levels of privilege:

 ![image](https://user-images.githubusercontent.com/55839128/110219671-9b542f80-7eb8-11eb-8bdf-f85550793cbe.png)

With the keys you can:
* Buckets
  * Create
  * Delete
  * View
* Files
	* Upload
  * Delete 
  * View
# Nodes
Nodes are a powerful tool that allows you to create buckets across multiple physical servers. 
![image](https://user-images.githubusercontent.com/55839128/110219744-e8380600-7eb8-11eb-9b29-fa262240bd0d.png)
