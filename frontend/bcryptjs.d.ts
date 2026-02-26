declare module "bcryptjs" {
  export function compare(data: string, encrypted: string): Promise<boolean>;
  export function hashSync(data: string, saltOrRounds: string | number): string;

  const bcrypt: {
    compare: typeof compare;
    hashSync: typeof hashSync;
  };

  export default bcrypt;
}
