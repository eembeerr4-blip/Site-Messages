// Local, interactive owner-only helper. Never exposes messages, tokens or IDs.
import {readFile,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
const rl=createInterface({input:stdin,output:stdout});
try {
 if(!stdin.isTTY) throw new Error('Interactive terminal required');
 const file=await readFile('.dev.vars','utf8');
 const match=file.match(/^TELEGRAM_BOT_TOKEN\s*=\s*(.*?)\s*$/m);
 const token=match?.[1].replace(/^(["'])(.*)\1$/,'$2');
 if(!token) throw new Error('Missing local secret');
 if((await rl.question('Используется НОВЫЙ токен после /revoke? [yes/no] ')).trim()!=='yes') throw new Error('Not confirmed');
 async function call(method,body){
  const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  const data=await r.json();if(!r.ok||data.ok!==true)throw new Error('Telegram rejected request');return data.result;
 }
 const updates=await call('getUpdates',{limit:100,timeout:0,allowed_updates:['message']});
 const chats=new Map();for(const u of updates){const c=u.message?.chat;if(c?.type==='private')chats.set(String(c.id),{id:String(c.id),label:[c.first_name,c.last_name,c.username?'@'+c.username:''].filter(Boolean).join(' ')});}
 const choices=[...chats.values()];if(!choices.length)throw new Error('No private chats; press Start in your bot');
 choices.forEach((c,i)=>console.log(`${i+1}. ${c.label}`));
 const index=Number(await rl.question('Номер вашего чата (сообщения не показываются): '))-1;
 if(!Number.isInteger(index)||!choices[index])throw new Error('Invalid selection');
 let next=file.replace(/^TELEGRAM_CHAT_ID=.*(?:\r?\n|$)/m,'');
 if(!next.endsWith('\n'))next+='\n';next+=`TELEGRAM_CHAT_ID=${choices[index].id}\n`;
 await writeFile('.dev.vars',next,{mode:0o600});
 console.log('Получатель сохранён только в исключённом из Git .dev.vars.');
 if((await rl.question('Отправить одно тестовое сообщение выбранному владельцу? [yes/no] ')).trim()==='yes'){
  const result=await call('sendMessage',{chat_id:choices[index].id,text:'Приглашение на свидание: тест подключения ♡'});
  if(!Number.isInteger(result?.message_id))throw new Error('Delivery not confirmed');
  console.log('Telegram подтвердил тестовое сообщение.');
 }
} catch { console.error('Настройка не завершена. Проверьте новый локальный секрет, Start в боте и выбранный чат. Приватные данные не выводятся.');process.exitCode=1; }
finally {rl.close();}
