var http = require('http'),
    util = require('util'),
 	fs = require('fs'),
    formidable = require('formidable'),
    knox = require('knox'),
 	exec = require('child_process').exec,
    server;

var PORT = process.env.PORT || 3003;	
var TMP = "/tmp";

var s3Client = knox.createClient({
    key: 'AKIAIIZEL3OLHCBIZBBQ'
  , secret: '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'
  , bucket: 'com.picbounce.incoming'
});

var image_convert_styles = [
	{"style" : "s150x150", "options": '-define jpeg: -resize "150x150^" -gravity center -crop 150x150+0+0 -auto-orient -quality 90'},
	{"style" : "s600x600", "options": '-define jpeg: -resize "600x600^" -gravity center -crop 600x600+0+0 -auto-orient -quality 90'},
	{"style" : "r600x600", "options" : '-resize "600x600>" -auto-orient'},
]


function on_header_receive(env){
	console.log(env['uuid'] + ' received headers');
	console.log(env['req'].headers['x-verify-credentials-authorization'])
	console.log(env['req'].headers['x-auth-service-provider'])
}

function on_save_complete(env){
	for (var i in image_convert_styles){
		convert(env['uuid'],image_convert_styles[i]["style"],image_convert_styles[i]["options"],convert_callback(env, image_convert_styles[i]["style"]))
	}
}

function on_convert_complete(env){
	console.log(env['uuid'] + ' returning response');
	env['res'].writeHead(200, {'content-type': 'text/plain'});
	env['res'].write('received fields:\n\n '+util.inspect(env['fields']));
	env['res'].write('\n\n');
	env['res'].end();
}


function convert_callback(env,style){
	return  function(error, stdout, stderr){
		console.log(env['uuid'] + " converting to " +TMP+"/"+env['uuid']+"-"+style+".jpg" + " complete ")
		console.log(env['uuid'] + ' upload to s3 started');
		var stream = fs.createReadStream(TMP+"/"+env['uuid']+"-"+style+".jpg");
		s3Client.putStream(stream, env['uuid']+"/"+style+".jpg", function(err, result){
			console.log(env['uuid'] + ' '+style+' upload to s3 complete');
			triggerEvent(env,style,"complete");
		});
	}
	
}

function convert(uuid,style,options,callback){
	var input_path = TMP+"/"+uuid
	var output_path = TMP+"/"+uuid + "-" +style +".jpg"
	exec("convert " + input_path + " " +options + " " + output_path , callback);
	console.log("converting  " +output_path + " triggered ")
	return output_path
}

function triggerEvent(env,key,result){
	env['event_queue'][key] = result;
	console.log(env['event_queue'])
	var all_converts_complete = true;
	for (var i in  image_convert_styles){
		all_converts_complete = all_converts_complete && env['event_queue'][image_convert_styles[i]["style"]] == "complete"
	}
	if (all_converts_complete){
		on_convert_complete(env)
	}	
}

function S4() {
  return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
}
function generate_uuid() {
  return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

server = http.createServer(function(req, res) {
  if (req.url == '/') {
	console.log("works!")
    res.writeHead(200, {'content-type': 'text/html'});
    res.end(
      '<form action="/v1/upload" enctype="multipart/form-data" method="post">'+
      '<input type="text" name="key"><br>'+
      '<input type="file" name="upload" multiple="multiple"><br>'+
      '<input type="submit" value="Upload">'+
      '</form>'
    );

  } else if (req.url == '/v1/upload') {
	var env = {}
	env['uuid'] = generate_uuid();
	env['req'] = req;
	env['res'] = res;
	env['event_queue'] = {};
	env['fields'] =	[]
	on_header_receive(env);
    var form = new formidable.IncomingForm()
    form.uploadDir = TMP;
	
	
	//prepare disk write
	var fileStream = fs.createWriteStream(TMP+"/"+env['uuid'])
    fileStream.addListener("error", function(err) {
        console.log("Got error while writing to file '" + env['uuid'] + "': ", err);
    });
    fileStream.addListener("drain", function() {
        req.resume();
    });

    form
	  .on('field', function(field, value) {
        console.log(env['uuid'] + " " + field + " => " + value);
        env['fields'].push([field, value]);
      })
   
      .on('end', function() {
		fileStream.addListener("drain", function() {
		     fileStream.end();
		     // Handle request completion, as all chunks were already written
		     on_save_complete(env);
		});
      });

	form.onPart = function(part) {
  		if (!part.filename) {
    		// let formidable handle all non-file parts
    		form.handlePart(part);
  		}else{
			part.addListener('data', function(data) {
				console.log(env['uuid'] + " receiving " + data.length + " bytes of " + part.filename );
			
				// Pause receiving request data (until current chunk is written)
				req.pause();
				fileStream.write(data, "binary");
			});
		}
	}
    form.parse(req);
  } else {
    res.writeHead(404, {'content-type': 'text/plain'});
    res.end('404');
  }
});
server.listen(PORT);

console.log('listening on http://localhost:'+PORT+'/');
