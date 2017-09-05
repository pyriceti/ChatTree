export class User {
  id: number;
  email: string;
  password: string;
  login?: string;
  label?: string;
  firstname?: string;
  lastname?: string;
  profile_picture?: string;
  conversations?: Array<number>;
}

export const defaultPP = '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\n';
