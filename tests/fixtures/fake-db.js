'use strict';

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
}

class FakeDb {
  constructor({ accounts = [], students = [], classes = [], roster = [], sessions = [] } = {}) {
    this.accounts = accounts;
    this.students = students;
    this.accounts.forEach(account => {
      if (account.auth_version === undefined) account.auth_version = 0;
    });
    this.students.forEach(student => {
      if (student.auth_version === undefined) student.auth_version = 0;
    });
    this.classes = classes;
    this.roster = roster;
    this.sessions = sessions;
    this.calls = [];
    this.nextInsertId = 1_000;
  }

  async query(sql, params = []) {
    const normalized = normalizeSql(sql);
    this.calls.push({ sql: normalized, params });

    if (normalized.includes('from accounts where username = ?')) {
      const account = this.accounts.find(item => item.username === params[0]);
      return [[account].filter(Boolean), []];
    }

    if (normalized.includes('from accounts where id = ?')) {
      const account = this.accounts.find(item => String(item.id) === String(params[0]));
      return [[account].filter(Boolean), []];
    }

    if (
      normalized.startsWith('update accounts set')
      && normalized.includes('password_hash = ?')
      && normalized.includes('must_change_password = 0')
      && normalized.includes('where id = ?')
    ) {
      const accountId = params[1];
      const expectedAuthVersion = params[2];
      const account = this.accounts.find(item =>
        String(item.id) === String(accountId)
        && (expectedAuthVersion === undefined || item.auth_version === expectedAuthVersion)
      );
      if (account) {
        account.password_hash = params[0];
        account.must_change_password = 0;
        if (normalized.includes('auth_version = auth_version + 1')) {
          account.auth_version += 1;
        }
      }
      return [{ affectedRows: account ? 1 : 0 }, []];
    }

    if (
      normalized.startsWith('update accounts set')
      && normalized.includes('password_hash = ?')
      && !normalized.includes('must_change_password = 0')
      && normalized.includes('where id = ?')
    ) {
      const account = this.accounts.find(item => String(item.id) === String(params[1]));
      if (account) {
        account.password_hash = params[0];
        if (normalized.includes('auth_version = auth_version + 1')) {
          account.auth_version += 1;
        }
      }
      return [{ affectedRows: account ? 1 : 0 }, []];
    }

    if (normalized.includes('select * from students where school_id = ? and student_number = ?')) {
      const student = this.students.find(item =>
        String(item.school_id) === String(params[0]) && item.student_number === params[1]
      );
      return [[student].filter(Boolean), []];
    }

    if (normalized.includes('from students where id = ?')) {
      const student = this.students.find(item => String(item.id) === String(params[0]));
      return [[student].filter(Boolean), []];
    }

    if (
      normalized.startsWith('update students set')
      && normalized.includes('password_hash = ?')
      && normalized.includes('where id = ?')
    ) {
      const student = this.students.find(item => String(item.id) === String(params[1]));
      if (student) {
        student.password_hash = params[0];
        if (normalized.includes('auth_version = auth_version + 1')) {
          student.auth_version += 1;
        }
      }
      return [{ affectedRows: student ? 1 : 0 }, []];
    }

    if (normalized.includes('select * from classes where id = ?')) {
      const classroom = this.classes.find(item => String(item.id) === String(params[0]));
      return [[classroom].filter(Boolean), []];
    }

    if (normalized.includes('from students where class_id = ? order by name')) {
      const rows = this.roster.filter(item => String(item.class_id) === String(params[0]));
      return [rows, []];
    }

    if (normalized.startsWith('insert into schools')) {
      return [{ insertId: this.nextInsertId++ }, []];
    }

    if (normalized.startsWith('insert into users')) {
      return [{ insertId: this.nextInsertId++ }, []];
    }

    if (normalized.startsWith('insert into sessions')) {
      const id = this.nextInsertId++;
      this.sessions.push({
        id,
        user_id: params[0],
        student_id: params[1],
        school_id: params[2],
        class_id: params[3],
        scene_name: params[4],
        device_type: params[5],
        write_token_hash: params[6] ?? null,
        started_at: new Date(),
      });
      return [{ insertId: id }, []];
    }

    if (normalized.includes('select id, student_id, write_token_hash from sessions where id = ?')) {
      const session = this.sessions.find(item => String(item.id) === String(params[0]));
      return [[session].filter(Boolean), []];
    }

    if (normalized.includes('select started_at from sessions where id = ?')) {
      const session = this.sessions.find(item => String(item.id) === String(params[0]));
      return [[session].filter(Boolean), []];
    }

    if (normalized.startsWith('update sessions set ended_at = now()')) {
      return [{ affectedRows: 1 }, []];
    }

    if (normalized.startsWith('insert into objects')) {
      return [{ insertId: this.nextInsertId++ }, []];
    }

    if (normalized.includes('select id from objects where object_code = ?')) {
      return [[{ id: 501 }], []];
    }

    if (normalized.startsWith('insert into interactions')) {
      return [{ insertId: this.nextInsertId++ }, []];
    }

    if (normalized.startsWith('insert into predictions')) {
      return [{ insertId: this.nextInsertId++ }, []];
    }

    if (normalized.startsWith('insert into quiz_results')) {
      return [{ insertId: this.nextInsertId++ }, []];
    }

    if (normalized.includes('select 1 as ok')) {
      return [[{ ok: 1 }], []];
    }

    if (normalized.includes('from sessions s') && normalized.includes('join users u')) {
      return [[], []];
    }

    throw new Error(`FakeDb belum memetakan SQL: ${normalized}`);
  }
}

module.exports = { FakeDb, normalizeSql };
