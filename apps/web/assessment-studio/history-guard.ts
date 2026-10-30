export const workspaceHistoryEvent = 'workspace-history-intent';

export type WorkspaceHistoryIntent = {
  destination: string;
  resume: () => Promise<void>;
};

/** Run before Next hydration so later mounted guards can stop restoration before their record unmounts. */
export const historyInitialization = String.raw`(()=>{
  if(window.__capstoneHistoryGuard)return;
  window.__capstoneHistoryGuard=true;
  const nav=window.navigation;
  const indexKey='__capstoneHistoryIndex';
  let position=Number.isInteger(history.state?.[indexKey])?
    history.state[indexKey]:0;
  if(!nav){
    const push=history.pushState.bind(history),replace=history.replaceState.bind(history);
    const tagged=(state,index)=>{
      const plain=state!==null&&typeof state==='object'&&
        (Object.getPrototypeOf(state)===null||Object.getPrototypeOf(state)===Object.prototype);
      return state===null||plain?{...state,[indexKey]:index}:state;
    };
    replace(tagged(history.state,position),'',location.href);
    history.pushState=function(state,title,url){
      const next=position+1;
      push(tagged(state,next),title,url);
      position=next;
    };
    history.replaceState=function(state,title,url){
      replace(tagged(state,position),title,url);
    };
  }
  let move=null,restoration=null,allowedIndex=null;
  if(nav)nav.addEventListener('navigate',event=>{
    if(event.navigationType==='traverse')move={
      from:nav.currentEntry?.index,to:event.destination.index,
    };
  });
  window.addEventListener('popstate',event=>{
    const index=nav?nav.currentEntry?.index:event.state?.[indexKey];
    if(!nav&&Number.isInteger(index)){
      move={from:position,to:index};
      position=index;
    }
    if(restoration){
      event.stopImmediatePropagation();
      move=null;
      if(index===restoration.index){
        const resolve=restoration.resolve;
        restoration=null;
        resolve();
      }else if(Number.isInteger(index))history.go(restoration.index-index);
      return;
    }
    if(allowedIndex!==null&&index===allowedIndex){
      allowedIndex=null;
      move=null;
      return;
    }
    const traversal=move;
    move=null;
    if(!traversal||!Number.isInteger(traversal.from)||
      !Number.isInteger(traversal.to)||traversal.from<0||
      traversal.to<0||traversal.from===traversal.to)return;
    let resolve;
    const restored=new Promise(done=>{resolve=done;});
    const intent=new CustomEvent('workspace-history-intent',{
      cancelable:true,
      detail:{
        destination:location.pathname+location.search+location.hash,
        resume:async()=>{
          await restored;
          allowedIndex=traversal.to;
          history.go(traversal.to-traversal.from);
        },
      },
    });
    if(!window.dispatchEvent(intent)){
      event.stopImmediatePropagation();
      restoration={index:traversal.from,resolve};
      history.go(traversal.from-traversal.to);
    }else resolve();
  },true);
})();`;
