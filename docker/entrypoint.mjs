import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

for(const key of ['DB_PASSWORD','JWT_SECRET']){
  if(process.env[`${key}_FILE`]){
    if(process.env[key])throw new Error(`Define ${key} o ${key}_FILE, no ambos.`);
    process.env[key]=readFileSync(process.env[`${key}_FILE`],'utf8').trim();
  }
}
if(!process.env.DATABASE_URL){
  for(const key of ['DB_HOST','DB_NAME','DB_USER','DB_PASSWORD'])if(!process.env[key])throw new Error(`Falta ${key}.`);
  const host=process.env.DB_HOST,port=process.env.DB_PORT??'5432';
  if(!/^[a-zA-Z0-9.-]+$/.test(host)||!/^\d+$/.test(port))throw new Error('Host/puerto DB inválido.');
  process.env.DATABASE_URL=`postgresql://${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASSWORD)}@${host}:${port}/${encodeURIComponent(process.env.DB_NAME)}`;
}
const action=process.argv[2]??'serve';
if(action==='serve')await import('../dist/main.js');
else{
  const {db}=await import('../dist/prisma/db.js');
  function cli(args){
    const result=spawnSync('/app/node_modules/.bin/prisma',args,{env:process.env,stdio:'inherit'});
    if(result.status!==0)throw new Error(`Prisma ${args.join(' ')} falló (${result.status}).`);
  }
  try{
    if(action==='bootstrap'){
      if(process.env.ALLOW_SCHEMA_BOOTSTRAP!=='CREATE_EMPTY_DATABASE'||process.env.DB_HOST!=='postgres')throw new Error('Bootstrap sólo opt-in de BD Compose nueva.');
      const rows=await db.runtime().query(db.raw.sql`SELECT current_database() AS database, current_user AS username, (SELECT count(*)::int FROM pg_tables WHERE schemaname='public') AS tables`.returnsRow({database:'pg/text@1',username:'pg/text@1',tables:'pg/int4@1'}).build());
      if(rows[0].database!==process.env.DB_NAME||rows[0].username!==process.env.DB_USER||rows[0].tables!==0)throw new Error('Bootstrap rechazado: identidad diferente o BD no vacía. No se modifica.');
      await db.close();
      cli(['db','update','--no-interactive']);
      const guarantees=spawnSync(process.execPath,['docs/backend-5b/aplicar-garantias.mjs'],{env:process.env,stdio:'inherit'});
      if(guarantees.status!==0)throw new Error('Garantía GiST no aplicada.');
      cli(['db','verify']);
    }else if(action==='verify')cli(['db','verify']);
    else if(action==='seed-local'){
      if(process.env.ALLOW_LOCAL_TEST_SEED!=='CREATE_SYNTHETIC_ADMIN'||process.env.E2E_DB_KIND!=='test'||!['inventario_prod_local','inventario_phase2a_validation'].includes(process.env.DB_NAME))throw new Error('Seed permitido sólo para validación local sintética identificada.');
      const email=process.env.E2E_ADMIN_EMAIL,password=process.env.E2E_ADMIN_PASSWORD;
      if(!/^e2e-s6-[a-z0-9-]+@example\.invalid$/.test(email??'')||!password||password.length<8)throw new Error('Credenciales sintéticas requeridas.');
      const {default:argon2}=await import('argon2');
      await db.transaction(async(tx)=>{
        let rol=await tx.orm.public.Rol.where({nombre:'ADMINISTRADOR'}).first();
        if(!rol)rol=await tx.orm.public.Rol.create({nombre:'ADMINISTRADOR',activo:true});
        if(!rol.activo)throw new Error('Rol preexistente no activo.');
        const user=await tx.orm.public.Usuario.where({email}).first();
        if(user){if(user.nombre!=='E2E-S6-ADMIN'||!user.activo||user.rolId!==rol.id||!await argon2.verify(user.password,password))throw new Error('Cuenta existente distinta: no se sustituye.');}
        else await tx.orm.public.Usuario.create({nombre:'E2E-S6-ADMIN',email,password:await argon2.hash(password),activo:true,rolId:rol.id});
      });
      console.log('Administrador local sintético verificado; sin seed comercial.');
    }else throw new Error('Comando desconocido.');
  }finally{await db.close();}
}
