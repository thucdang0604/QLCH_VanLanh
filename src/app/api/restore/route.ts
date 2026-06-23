import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function GET() {
  try {
    const addOut = execSync('git add .', { encoding: 'utf8' });
    const commitOut = execSync('git commit -m "docs: create Group 2 walkthroughs and update manifest registry"', { encoding: 'utf8' });
    return NextResponse.json({
      ok: true,
      add: addOut || 'git add success',
      commit: commitOut
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message,
      stdout: error.stdout,
      stderr: error.stderr
    }, { status: 200 });
  }
}
