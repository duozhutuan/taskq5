import axios from 'axios'
import {connectBridge,sendMessage} from './nostrBridge_client.js'
import {send_task,update_task} from './sendtask.js'
import {Keypub} from './getkey.js'

export function doRequest(content,callback) {
       console.log(content.url)
       axios.get(content.url,{headers:content.headers})
        .then(response=>{
            callback(response.data)
        })
        .catch(error => {
            callback(null);
        });
}

//bridge message
async function handle_send_message(socket,message,req_task,finishTask){

        if (message.action == "clientId" ){
            req_task["clientId"] = message.content
            console.log("clientId:",message.content)
            let taskevent = await send_task (JSON.stringify(req_task));
        }
        if (message.action == 'message'){
            let content = message.message
            if (content.type == 'ping'){
                //swap from,to
                sendMessage(socket,message.from,message.to,{type:'pong'})
            }

            if (content.type == 'response'){
                console.log("Done EventId: ", content.eventid)
                update_task(req_task,content.eventid,content.identifer,content.pubkey)
                finishTask(content);
            }
        } 
}


export function sendRequest(req_task,finishTask){

    connectBridge(req_task['Bridge'],(socket,message)=>{
            handle_send_message(socket,message,req_task,finishTask);
    });
}



//bridge message 

function handle_recv_message(socket,message,reqcontent){
    return new Promise((resolve, reject) => {    

        if (message.action == "clientId"){
            let clientId = message.content;
            sendMessage(socket,reqcontent.clientId,clientId,{type:'ping'})
            return resolve(302)
        }

        if (message.action == "message"){
            if (message.code != 200) {
                return resolve(message.code)
            }

            let content = message.message
            if (content.type == "pong"){
                doRequest(reqcontent,(data)=>{
                    console.log(reqcontent.id,data.length)
                    sendMessage(socket,message.from,message.to,
                                            {type:"response",
                                            data:data,
                                            eventid:reqcontent.id,
                                            pubkey:Keypub,
                                            identifer:reqcontent.identifer});
                    return resolve(200);
                })
            }
        } //action message

    })//Promise
}
export async function recvRquest(data) {
    let content = JSON.parse(data.content) 

    if (content.status == 'done'){
        return 
    }

    content['id'] = data.id
    content['identifer'] = data.tags[0][1]
    return new Promise((resolve, reject) => { 
        if (content['Bridge'] && content['clientId']){ 
		connectBridge(content['Bridge'],async (socket,message)=>{
                      
                      let code = await handle_recv_message(socket,message,content);
                      if (code == 200){
                        socket.close();
                        return resolve('recv done');
                      }
                      if (code == 404 || code == 502){
                        socket.close();
                        return resolve('target offline');
                      }
                });

        } else {

                return resolve('requests version not match');
        }

    })
}

export let requestTask = {
    "type":"requests",
    "cb":recvRquest
} 
