import crypto from 'node:crypto';

export type DirectoryContactIdFactory = () => string;

export const createDirectoryContactId: DirectoryContactIdFactory = () => `dir_${crypto.randomUUID()}`;

export async function createUniqueDirectoryContactId(
  exists: (id: string) => boolean | Promise<boolean>,
  factory: DirectoryContactIdFactory = createDirectoryContactId,
  maxAttempts = 4
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const id = factory();
    if (!(await exists(id))) return id;
  }
  throw new Error('DIRECTORY_CONTACT_ID_COLLISION');
}
