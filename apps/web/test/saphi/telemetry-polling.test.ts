import {afterEach,describe,it,expect,vi} from 'vitest';
import {createApp,ref,nextTick} from 'vue';
import {useTelemetryPolling} from '../../src/modules/saphi/composables/useTelemetryPolling';
afterEach(()=>{vi.useRealTimers();});
describe('telemetry polling lifecycle',()=>{
 it('does not overlap requests, validates intervals and stops on disable and unmount',async()=>{
  vi.useFakeTimers();const active=ref(false),seconds=ref(5);let release!:()=>void;
  const action=vi.fn(()=>new Promise<void>(yes=>{release=yes;}));
  const host=document.createElement('div');const app=createApp({setup(){useTelemetryPolling(action,active,seconds);return()=>null;}});app.mount(host);
  await vi.advanceTimersByTimeAsync(5000);expect(action).not.toHaveBeenCalled();
  active.value=true;await nextTick();await vi.advanceTimersByTimeAsync(5000);expect(action).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(20000);expect(action).toHaveBeenCalledTimes(1);
  active.value=false;await nextTick();release();await vi.advanceTimersByTimeAsync(10000);expect(action).toHaveBeenCalledTimes(1);
  seconds.value=1;active.value=true;await nextTick();await vi.advanceTimersByTimeAsync(5000);expect(action).toHaveBeenCalledTimes(1);
  seconds.value=5;await nextTick();app.unmount();await vi.advanceTimersByTimeAsync(5000);expect(action).toHaveBeenCalledTimes(1);
 });
});
