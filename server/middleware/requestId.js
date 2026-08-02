import { ulid } from 'ulid';

export function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : ulid();
  res.setHeader('X-Request-Id', req.id);
  next();
}
