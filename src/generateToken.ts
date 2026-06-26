// src/generateToken.ts
import jwt from 'jsonwebtoken';
import 'dotenv/config';

// Cria um token de ADMIN que não expira tão cedo para seus testes
const token = jwt.sign(
  { role: 'ADMIN', id: 'master_admin' }, 
  process.env.JWT_SECRET!, 
  { expiresIn: '30d' }
);

console.log('====================================');
console.log('🔑 SEU TOKEN DE ADMINISTRAÇÃO:');
console.log(token);
console.log('====================================');

