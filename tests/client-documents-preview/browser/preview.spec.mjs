import {test,expect} from '@playwright/test';
test('client layout is clearly a prototype with seven unconfirmed stages and no pretend downloads',async({page})=>{
 const attempted=[];page.on('request',r=>{if(/\/api\//.test(new URL(r.url()).pathname)||/googleapis|drive\.google/.test(r.url()))attempted.push(r.url());});
 await page.goto('/');await expect(page.getByText('PROTOTYPE',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Your documents & journey'})).toBeVisible();
 await expect(page.locator('ol li')).toHaveCount(7);await expect(page.getByText('Unconfirmed',{exact:true})).toHaveCount(7);
 await expect(page.getByRole('button',{name:/download|publish|approve/i})).toHaveCount(0);expect(attempted).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('admin preview describes the assignment and verification flow without real mutation controls',async({page})=>{
 await page.goto('/?mode=admin');await expect(page.getByRole('heading',{name:'Planned administrator flow'})).toBeVisible();
 await expect(page.getByText('Select the existing client account.',{exact:true})).toBeVisible();await expect(page.getByRole('button')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('dashboard summary leads to the full library preview and invents no files',async({page})=>{
 await page.goto('/?mode=dashboard');await expect(page.getByRole('heading',{name:'Your documents',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'View document library preview'})).toHaveAttribute('href','/?view=documents&journeyPreview=1');
 await expect(page.getByText('Document delivery is not connected in this layout preview.',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
