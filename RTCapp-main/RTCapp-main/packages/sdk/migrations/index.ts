import { schemaMigrations, createTable, addColumns } from '@nozbe/watermelondb/Schema/migrations'

export default schemaMigrations({
  migrations: [

    // ── v1 → v2 (Week 3–4: auth service) ──────────────────
    {
      toVersion: 2,
      steps: [
        // addColumns({
        //   table: 'api_keys',
        //   columns: [
        //     { name: 'refresh_token', type: 'string', isOptional: true },
        //   ],
        // }),
      ],
    },

    // ── v2 → v3 (Week 11–12: CDR metering region) ─────────
    // {
    //   toVersion: 3,
    //   steps: [
    //     addColumns({
    //       table: 'sessions',
    //       columns: [
    //         { name: 'region', type: 'string', isOptional: true },
    //       ],
    //     }),
    //   ],
    // },

    // ── v3 → v4 (Week 19–20: recordings) ──────────────────
    // {
    //   toVersion: 4,
    //   steps: [
    //     createTable({
    //       name: 'recordings',
    //       columns: [
    //         { name: 'recording_id', type: 'string' },
    //         { name: 'channel_id',   type: 'string' },
    //         { name: 'url',          type: 'string', isOptional: true },
    //         { name: 'status',       type: 'string' },
    //         { name: 'started_at',   type: 'number' },
    //         { name: 'ended_at',     type: 'number', isOptional: true },
    //         { name: 'synced',       type: 'boolean' },
    //         { name: 'created_at',   type: 'number' },
    //       ],
    //     }),
    //   ],
    // },

  ],  // ← array closes here (after ALL migrations, commented or not)
});  // ← schemaMigrations closes here