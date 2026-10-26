import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import { createVuetify } from 'vuetify';
import AppConfirmDialog from '../src/AppConfirmDialog.vue';
import AppPageHeader from '../src/AppPageHeader.vue';
import AppPasswordField from '../src/AppPasswordField.vue';
import AppStatusChip from '../src/AppStatusChip.vue';

const vuetify = createVuetify();
const global = { plugins: [vuetify] };

describe('AppPageHeader', () => {
  it('renders title, subtitle and actions', () => {
    const wrapper = mount(AppPageHeader, {
      global,
      props: { title: 'Usuarios', subtitle: 'Gestión de cuentas' },
      slots: { actions: () => h('button', 'Nuevo') },
    });
    expect(wrapper.find('h1').text()).toBe('Usuarios');
    expect(wrapper.text()).toContain('Gestión de cuentas');
    expect(wrapper.find('button').text()).toBe('Nuevo');
  });

  it('omits the subtitle and actions when not given', () => {
    const wrapper = mount(AppPageHeader, { global, props: { title: 'Perfiles' } });
    expect(wrapper.find('p').exists()).toBe(false);
    expect(wrapper.find('.app-page-header__actions').exists()).toBe(false);
  });
});

describe('AppStatusChip', () => {
  it('shows the label with the tone color', () => {
    const active = mount(AppStatusChip, { global, props: { tone: 'success', label: 'Activo' } });
    expect(active.text()).toContain('Activo');
    expect(active.html()).toContain('text-success');
    const neutral = mount(AppStatusChip, { global, props: { tone: 'neutral', label: 'Inactivo' } });
    expect(neutral.html()).toContain('text-grey');
  });
});

describe('AppPasswordField', () => {
  it('hides the password until the toggle is pressed', async () => {
    const wrapper = mount(AppPasswordField, {
      global,
      props: { label: 'Contraseña', autocomplete: 'current-password', toggleLabel: 'Mostrar', modelValue: 'secret' },
    });
    const input = wrapper.find('input');
    expect(input.attributes('type')).toBe('password');
    expect(input.attributes('autocomplete')).toBe('current-password');
    await wrapper.find('[data-test="toggle"]').trigger('click');
    expect(wrapper.find('input').attributes('type')).toBe('text');
  });

  it('emits model updates', async () => {
    const wrapper = mount(AppPasswordField, { global, props: { label: 'Nueva', autocomplete: 'new-password', toggleLabel: 'Mostrar' } });
    await wrapper.find('input').setValue('Abc-123456789!');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['Abc-123456789!']);
  });
});

describe('AppConfirmDialog', () => {
  const props = { title: '¿Desactivar?', message: 'El usuario no podrá ingresar.', confirmText: 'Desactivar', cancelText: 'Cancelar' };

  it('emits confirm and closes on cancel', async () => {
    const wrapper = mount(AppConfirmDialog, { global, props: { ...props, modelValue: true, danger: true }, attachTo: document.body });
    await wrapper.vm.$nextTick();
    const confirm = document.querySelector<HTMLButtonElement>('[data-test="confirm"]')!;
    expect(document.body.textContent).toContain('El usuario no podrá ingresar.');
    expect(confirm.className).toContain('bg-error');
    confirm.click();
    expect(wrapper.emitted('confirm')).toHaveLength(1);
    document.querySelector<HTMLButtonElement>('[data-test="cancel"]')!.click();
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    wrapper.unmount();
  });
});
