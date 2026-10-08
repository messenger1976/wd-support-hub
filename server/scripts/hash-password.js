// Usage: npm run hash-password -w server -- "NewPassword123"
// Prints a bcrypt hash for wd_support_hub_user.password_hash.
import bcrypt from 'bcryptjs';

const plain = process.argv[2];
if (!plain) {
	console.error('Usage: npm run hash-password -w server -- "NewPassword123"');
	process.exit(1);
}
console.log(bcrypt.hashSync(plain, 10));
