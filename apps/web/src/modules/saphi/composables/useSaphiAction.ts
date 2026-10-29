import { useApiAction } from '../../../composables/useApiAction';
import { ApiError } from '../../../services/http';
import { useSaphiCompanyStore } from '../stores/company';
import { computed, ref } from 'vue';

/** Revalidate the UI snapshot after a rejection; the API remains the authority. */
export function useSaphiAction(){
  const base=useApiAction();const company=useSaphiCompanyStore();
  let lastRejectedCompany:string|null=null;
  const pending=ref(0);const loading=computed(()=>pending.value>0);
  async function run<T>(action:()=>Promise<T>,success?:string){
    pending.value++;
    try{return await base.run(async()=>{
      try{const result=await action();lastRejectedCompany=null;return result;}
      catch(error){
        if(error instanceof ApiError&&error.status===403&&company.companyId&&company.companyId!==lastRejectedCompany){
          lastRejectedCompany=company.companyId;
          try{await company.activate(company.companyId);}catch{/* activate clears inaccessible state */}
        }
        throw error;
      }
    },success);}finally{pending.value--;}
  }
  return{...base,loading,run};
}
