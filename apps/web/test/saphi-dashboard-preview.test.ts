import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';
import SaphiDashboardPreview from '../src/modules/saphi/presentation/dashboard/SaphiDashboardPreview.vue';
import VineyardMap from '../src/modules/saphi/presentation/dashboard/components/VineyardMap.vue';
import VineyardAnalytics from '../src/modules/saphi/presentation/dashboard/components/VineyardAnalytics.vue';
import { dashboardPreviewData } from '../src/modules/saphi/presentation/dashboard/data/dashboardPreviewData';

const wrappers: VueWrapper[] = [];
const global = { stubs: { VIcon: { template: '<i aria-hidden="true" />' } } };
function render(component: Parameters<typeof mount>[0], props = {}) {
  const wrapper = mount(component, { props, global });
  wrappers.push(wrapper);
  return wrapper;
}
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.unstubAllGlobals(); });

describe('isolated Saphi dashboard presentation', () => {
  it('renders fixtures and identifies simulated measurements without network or storage effects', () => {
    const fetch = vi.fn(() => { throw new Error('Preview must not make requests'); });
    vi.stubGlobal('fetch', fetch);
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const wrapper = render(SaphiDashboardPreview);
    expect(wrapper.find('h1').text()).toBe('El pulso de tu viñedo');
    expect(wrapper.text()).toContain(dashboardPreviewData.demoLabel);
    expect(wrapper.findAll('.saphi-metric')).toHaveLength(3);
    expect(wrapper.text()).toContain('28,4');
    expect(wrapper.text()).toContain('19,7');
    expect(wrapper.text()).toContain('94');
    expect(wrapper.findAll('.saphi-activity li')).toHaveLength(3);
    expect(wrapper.findAll('nav a')).toHaveLength(0);
    expect(wrapper.findAll('nav [aria-current="page"]')).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
  });

  it('accepts a replacement presentation contract and shows all empty states', () => {
    const data = { ...dashboardPreviewData, estate: 'Predio de prueba', metrics: [], blocks: [], analytics: [], activity: [] };
    const wrapper = render(SaphiDashboardPreview, { data });
    expect(wrapper.text()).toContain('Predio de prueba');
    expect(wrapper.findAll('.saphi-metric')).toHaveLength(0);
    expect(wrapper.text()).toContain('Sin cuarteles para mostrar.');
    expect(wrapper.text()).toContain('Sin datos para este indicador.');
    expect(wrapper.text()).toContain('Sin actividad para mostrar.');
  });

  it('embeds inside the existing company shell without a second header, sidebar or main landmark', () => {
    const data = { ...dashboardPreviewData, estate: 'Empresa seleccionada' };
    const wrapper = render(SaphiDashboardPreview, { data, embedded: true });
    expect(wrapper.text()).toContain('Empresa seleccionada');
    expect(wrapper.text()).toContain('DEMO / DATOS SIMULADOS');
    expect(wrapper.find('.saphi-header').exists()).toBe(false);
    expect(wrapper.find('.saphi-sidebar').exists()).toBe(false);
    expect(wrapper.find('main').exists()).toBe(false);
    expect(wrapper.find('h1').exists()).toBe(false);
    expect(wrapper.find('.saphi-dashboard-title').element.tagName).toBe('H2');
  });

  it('supports keyboard selection, updated block props and bounded local map zoom', async () => {
    const wrapper = render(VineyardMap, { blocks: dashboardPreviewData.blocks, legend: dashboardPreviewData.legend });
    const blocks = wrapper.findAll('[role="button"]');
    await blocks[0]!.trigger('keydown', { key: 'Enter' });
    expect(blocks[0]!.attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[role="status"]').text()).toContain('29,2 %');
    await blocks[1]!.trigger('keydown', { key: ' ' });
    expect(blocks[1]!.attributes('aria-pressed')).toBe('true');
    expect(blocks[0]!.attributes('aria-pressed')).toBe('false');
    const zoomIn = wrapper.find('[aria-label="Acercar mapa"]');
    for (let i = 0; i < 4; i++) await zoomIn.trigger('click');
    expect(zoomIn.attributes()).toHaveProperty('disabled');
    await wrapper.find('[aria-label="Alejar mapa"]').trigger('click');
    expect(zoomIn.attributes()).not.toHaveProperty('disabled');
    await wrapper.find('[aria-label="Restablecer mapa"]').trigger('click');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Alejar mapa"]').attributes()).toHaveProperty('disabled');
    await blocks[0]!.trigger('click');
    await wrapper.find('[aria-label="Cerrar detalle del cuartel"]').trigger('click');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    const empty = render(VineyardMap, { blocks: [], legend: dashboardPreviewData.legend });
    expect(empty.text()).toContain('Sin cuarteles');
  });

  it('uses unique SVG pattern identifiers when two maps are mounted', () => {
    const props = { blocks: dashboardPreviewData.blocks, legend: dashboardPreviewData.legend };
    const wrapper = render(defineComponent({
      components: { VineyardMap },
      setup: () => ({ mapProps: props }),
      template: '<div><VineyardMap v-bind="mapProps" /><VineyardMap v-bind="mapProps" /></div>',
    }));
    const patterns = wrapper.findAll('pattern');
    expect(patterns[0]!.attributes('id')).not.toBe(patterns[1]!.attributes('id'));
  });

  it('switches accessible chart series and exposes exact demonstration values', async () => {
    const wrapper = render(VineyardAnalytics, { points: dashboardPreviewData.analytics, blocks: dashboardPreviewData.blocks });
    expect(wrapper.findAll('.saphi-chart-bar')).toHaveLength(7);
    expect(wrapper.find('.saphi-chart-bar').attributes('aria-label')).toContain('72 m³');
    const tabs = wrapper.findAll('.saphi-chart-tabs button');
    await tabs[1]!.trigger('click');
    expect(tabs[1]!.attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('.saphi-chart-bar').attributes('aria-label')).toContain('28 %');
    await tabs[2]!.trigger('click');
    expect(wrapper.findAll('.saphi-chart-bar')).toHaveLength(6);
    expect(wrapper.find('.saphi-chart-bar').attributes('aria-label')).toContain('C-01: 29,2 %');
    await tabs[0]!.trigger('click');
    expect(tabs[0]!.attributes('aria-pressed')).toBe('true');
  });
});
