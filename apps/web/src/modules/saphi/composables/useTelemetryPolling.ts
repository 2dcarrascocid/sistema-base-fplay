import {onBeforeUnmount,watch,type Ref} from 'vue';
/** Sequential REST polling. No request overlap; hidden tabs pause until the next interval. */
export function useTelemetryPolling(action:()=>Promise<void>,active:Ref<boolean>,seconds:Ref<number>){
  let timer:ReturnType<typeof setTimeout>|undefined,generation=0;
  const stop=()=>{generation++;clearTimeout(timer);};
  const schedule=(current:number)=>{
    if(current!==generation||!active.value||!Number.isInteger(seconds.value)||seconds.value<5||seconds.value>3600)return;
    timer=setTimeout(async()=>{
      try{if(document.visibilityState!=='hidden')await action();}
      catch{/* The view owns the request error state; polling may resume on the next interval. */}
      finally{schedule(current);}
    },seconds.value*1000);
  };
  watch([active,seconds],()=>{stop();schedule(generation);},{immediate:true});
  onBeforeUnmount(stop);
}
