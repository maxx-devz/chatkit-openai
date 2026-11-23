import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'Isolated dropdown fixture; no provider or database access.'}}));
  await page.goto('/dropdowns');
});

test('the styled picker opens, highlights selection and commits an enabled option',async({page})=>{
  const select=page.getByLabel('Client account',{exact:true});
  expect(await page.evaluate(()=>CSS.supports('appearance','base-select'))).toBe(true);
  await expect(select).toHaveCSS('appearance','base-select');
  await select.click();await expect(select).toHaveJSProperty('value','alpha');
  await expect(page.getByRole('option',{name:'Alpha Client',exact:true})).toBeVisible();
  await expect(page.getByRole('option',{name:/Paused client/})).toBeDisabled();
  await expect(page.getByRole('option',{name:'Alpha Client',exact:true})).toHaveCSS('background-color','rgb(232, 242, 255)');
  expect(await select.evaluate(el=>getComputedStyle(el,'::picker(select)').opacity)).toBe('1');
  await page.screenshot({path:test.info().outputPath('styled-dropdown-open.png'),fullPage:true,animations:'disabled'});
  await page.getByRole('option',{name:'Beta Client',exact:true}).click();await expect(select).toHaveValue('beta');
  expect(await select.evaluate(el=>el.matches(':open'))).toBe(false);
});

test('keyboard navigation, typeahead and Escape preserve selection and focus',async({page})=>{
  const select=page.getByLabel('Client account',{exact:true});await select.focus();await page.keyboard.press('Space');
  await expect(page.getByRole('option',{name:'Alpha Client',exact:true})).toBeVisible();
  await page.keyboard.press('b');await page.keyboard.press('Enter');await expect(select).toHaveValue('beta');
  await select.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowUp');await page.keyboard.press('Escape');
  await expect(select).toHaveValue('beta');await expect(select).toBeFocused();
});

test('long menus fit the viewport and can reach the last option without overflowing the page',async({page})=>{
  const select=page.getByLabel('Report',{exact:true});await select.click();
  const geometry=await select.evaluate(el=>{const css=getComputedStyle(el,'::picker(select)');return {height:parseFloat(css.maxBlockSize),width:parseFloat(css.maxInlineSize),viewport:innerHeight};});
  expect(geometry.height).toBeLessThanOrEqual(Math.min(360,geometry.viewport*.55)+1);
  expect(geometry.width).toBeLessThanOrEqual(page.viewportSize().width);
  await page.keyboard.press('End');await page.keyboard.press('Enter');await expect(select).toHaveValue('59');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('GET forms, reset, required validation and disabled controls keep their original semantics',async({page})=>{
  await expect(page.getByLabel('Connection',{exact:true})).toBeDisabled();await expect(page.getByLabel('Provider',{exact:true})).toBeDisabled();
  const select=page.getByLabel('Client account',{exact:true});await select.selectOption('beta');
  await page.getByRole('button',{name:'Reset selection',exact:true}).click();await expect(select).toHaveValue('alpha');
  await select.selectOption('');await page.getByRole('button',{name:'Apply selection',exact:true}).click();await expect(select).toBeFocused();expect(new URL(page.url()).search).toBe('');
  await select.selectOption('beta');await page.getByRole('button',{name:'Apply selection',exact:true}).click();await expect(page).toHaveURL(/workspace=beta&report=0/);
});

test('menus escape clipped cards and close on outside clicks',async({page})=>{
  const select=page.getByLabel('Inside a clipped card',{exact:true});await select.scrollIntoViewIfNeeded();await select.click();
  const option=page.getByRole('option',{name:'Third option',exact:true});await expect(option).toBeVisible();await option.click();await expect(select).toHaveValue('c');
  await select.click();await page.getByRole('button',{name:'Outside picker',exact:true}).click();expect(await select.evaluate(el=>el.matches(':open'))).toBe(false);await expect(select).toHaveValue('c');
});

test('reduced-motion preferences disable menu and arrow animations',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const select=page.getByLabel('Client account',{exact:true});await select.click();
  const animation=await select.evaluate(el=>({menu:getComputedStyle(el,'::picker(select)').animationName,arrow:getComputedStyle(el,'::picker-icon').transitionDuration}));
  expect(animation).toEqual({menu:'none',arrow:'0s'});
  await page.keyboard.press('Escape');
});
