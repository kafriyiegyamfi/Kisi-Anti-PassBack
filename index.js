const Kisi =  require("./kisi-client.js")
const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });


require("regenerator-runtime");
require("dotenv").config()

const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
const encrypted = process.env['KISI_API'];
const kisiClient = new Kisi()
let decrypted;

async function processEvent(event,context,callback) {

    // filtering for unlock event
    if ((event.action.trim() == "unlock") && event.success == true) {
            

        async function addUserToGroup(email, group_id) {  
            console.log('starting adding function')

            const share = {                    
                "user_id" : event.actor_id,
                "group_id" : group_id
            }
            await kisiClient
                .get("shares", share)
                .then(async function(shares) { 
                    console.log(shares)
                    if (!shares.data.length) {      // Checks if user already exist in the group
                        const share = {
                            "email" : email,
                            "group_id" : group_id
                        }
                        await kisiClient                          // add user to a group
                            .post("shares", share)
                            .then(share => console.log(share))
                            .catch(error => console.log(error))
                        
                    }
                })
                .catch(error => console.log(error))
                
        }

        async function removeUserFromGroup() {        
            await kisiClient.delete(`shares/${event.references[2].id}`)     // deletes a user with a given share
            .then(share => console.log(share))
            .catch(error => console.log(error))
        
        }

        async function unlockDoor(lock_id) {
            await kisiClient.post(`locks/${lock_id}/unlock`)
            .then(unlock_message => console.log(unlock_message))
            .catch(error => console.log(error))
            
        }

        if (event.object_id == process.env.DOOR_IN) {      
            await kisiClient.get(`shares/${event.references[2].id}`)
                .then(async function(share) {
                    console.log(share)
                    if (share.role != 'administrator') {
                        await addUserToGroup(share.email.trim(), process.env.DOOR_OUT_GROUP)
                        await removeUserFromGroup()
                    }
                       
                })
                .catch(error => console.log(error))
                
        } else if(event.object_id == process.env.DOOR_OUT) {

            await unlockDoor(process.env.DOOR_IN) 

            await kisiClient.get(`shares/${event.references[2].id}`)
                .then(async function(share) {

                    console.log(share)
                    
                    if (share.role != 'administrator') {
                        await addUserToGroup(share.email.trim(), process.env.DOOR_IN_GROUP)
                        await removeUserFromGroup()
                    }
                })
                .catch(error => console.log(error))
            
        }
    }

    callback(null, 'Ok')
}

exports.handler = async function(event, context, callback) {
    
    if (!decrypted) {
        const kms = new AWS.KMS();
        try {
            const req = {
                CiphertextBlob: Buffer.from(encrypted, 'base64'),
                EncryptionContext: { LambdaFunctionName: functionName },
            };
            const data = await kms.decrypt(req).promise();
            decrypted = data.Plaintext.toString('ascii');
            kisiClient.setLoginSecret(decrypted)
        } catch (err) {
            console.log('Decrypt error:', err);
            throw err;
        }
    }
    await processEvent(event,context, callback);
};
