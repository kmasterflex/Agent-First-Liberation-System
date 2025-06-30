#!/usr/bin/env node
/**
 * Test AI Services Command
 * Quick test utility for validating AI services setup
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { config } from 'dotenv';
import { createClaudeService, createMemoryService, createContextService } from '../services/index.js';

// Load environment variables
config();

const program = new Command();

program
  .name('test-ai-services')
  .description('Test AI services functionality')
  .version('1.0.0');

program
  .command('claude')
  .description('Test Claude service connection')
  .option('-m, --message <message>', 'Message to send', 'Hello, Claude! Please respond with a brief greeting.')
  .action(async (options) => {
    const spinner = ora('Testing Claude service...').start();

    try {
      const claude = createClaudeService({
        apiKey: process.env.ANTHROPIC_API_KEY!
      });

      if (!process.env.ANTHROPIC_API_KEY) {
        spinner.fail(chalk.red('ANTHROPIC_API_KEY not found in environment'));
        return;
      }

      spinner.text = 'Validating API key...';
      const isValid = await claude.validateApiKey();

      if (!isValid) {
        spinner.fail(chalk.red('Invalid API key'));
        return;
      }

      spinner.text = 'Sending message...';
      const response = await claude.sendMessage(options.message);

      spinner.succeed(chalk.green('Claude service test successful!'));
      console.log(chalk.cyan('\nResponse:'), response.content);
      console.log(chalk.gray('\nUsage:'), response.usage);

    } catch (error) {
      spinner.fail(chalk.red('Claude service test failed'));
      console.error(error);
    }
  });

program
  .command('memory')
  .description('Test Memory service functionality')
  .action(async () => {
    const spinner = ora('Testing Memory service...').start();

    try {
      const memory = createMemoryService({
        persistencePath: './.claude/test-memory'
      });

      spinner.text = 'Initializing memory service...';
      await memory.initialize();

      spinner.text = 'Storing short-term memory...';
      await memory.store('test-short', { data: 'Short-term test data' }, {
        type: 'short-term',
        importance: 0.5,
        tags: ['test', 'short-term']
      });

      spinner.text = 'Storing long-term memory...';
      await memory.store('test-long', { data: 'Long-term test data' }, {
        type: 'long-term',
        importance: 0.9,
        tags: ['test', 'long-term']
      });

      spinner.text = 'Retrieving memories...';
      const shortTerm = await memory.get('test-short');
      const longTerm = await memory.get('test-long');

      if (!shortTerm || !longTerm) {
        throw new Error('Failed to retrieve stored memories');
      }

      spinner.text = 'Searching memories...';
      const searchResults = await memory.search({ tags: ['test'] });

      spinner.text = 'Getting statistics...';
      const stats = await memory.getStats();

      spinner.succeed(chalk.green('Memory service test successful!'));
      console.log(chalk.cyan('\nMemory Stats:'));
      console.log(`  Short-term: ${stats.shortTermCount} entries`);
      console.log(`  Long-term: ${stats.longTermCount} entries`);
      console.log(`  Total size: ${stats.totalSize} bytes`);
      console.log(`  Search found: ${searchResults.length} entries`);

      // Cleanup
      await memory.clear('all');

    } catch (error) {
      spinner.fail(chalk.red('Memory service test failed'));
      console.error(error);
    }
  });

program
  .command('context')
  .description('Test Context service functionality')
  .action(async () => {
    const spinner = ora('Testing Context service...').start();

    try {
      const context = createContextService({
        maxWindowSize: 10,
        maxTokens: 1000,
        slidingStrategy: 'hybrid'
      });

      spinner.text = 'Adding messages to context...';
      const messages = [
        { role: 'user' as const, content: 'Hello, I need help with coding' },
        { role: 'assistant' as const, content: 'I\'d be happy to help with coding!' },
        { role: 'user' as const, content: 'Can you explain async/await?' },
        { role: 'assistant' as const, content: 'Async/await is a way to handle asynchronous operations...' }
      ];

      for (const msg of messages) {
        await context.addMessage(msg, {
          importance: msg.role === 'user' ? 0.8 : 0.6
        });
      }

      spinner.text = 'Getting context window...';
      const window = context.getCurrentWindow();

      if (window.messages.length === 0) {
        throw new Error('No messages in context window');
      }

      spinner.text = 'Getting messages for API...';
      const apiMessages = context.getMessagesForAPI(500);

      spinner.text = 'Searching messages...';
      const searchResults = context.searchMessages('async');

      spinner.text = 'Getting statistics...';
      const stats = context.getStats();

      spinner.succeed(chalk.green('Context service test successful!'));
      console.log(chalk.cyan('\nContext Stats:'));
      console.log(`  Current window: ${stats.currentWindowSize} messages`);
      console.log(`  Total tokens: ${stats.totalTokens}`);
      console.log(`  Message distribution: ${stats.messageDistribution.user} user, ${stats.messageDistribution.assistant} assistant`);
      console.log(`  API messages: ${apiMessages.length} (limited by tokens)`);
      console.log(`  Search results: ${searchResults.length} messages`);

    } catch (error) {
      spinner.fail(chalk.red('Context service test failed'));
      console.error(error);
    }
  });

program
  .command('integrated')
  .description('Test integrated AI services')
  .action(async () => {
    const spinner = ora('Testing integrated AI services...').start();

    try {
      if (!process.env.ANTHROPIC_API_KEY) {
        spinner.fail(chalk.red('ANTHROPIC_API_KEY not found in environment'));
        return;
      }

      // Initialize all services
      spinner.text = 'Initializing services...';
      const claude = createClaudeService({
        apiKey: process.env.ANTHROPIC_API_KEY
      });

      const memory = createMemoryService({
        persistencePath: './.claude/test-integrated'
      });
      await memory.initialize();

      const context = createContextService({
        maxWindowSize: 20,
        slidingStrategy: 'hybrid'
      });

      // Store user information in memory
      spinner.text = 'Storing user preferences...';
      await memory.store('user_info', {
        name: 'Test User',
        preferences: { language: 'TypeScript', framework: 'React' }
      }, {
        type: 'long-term',
        importance: 0.9,
        tags: ['user', 'preferences']
      });

      // Add conversation to context
      spinner.text = 'Building conversation context...';
      await context.addMessage({
        role: 'user',
        content: 'I want to build a React app with TypeScript'
      });

      // Get memory and context for Claude
      spinner.text = 'Preparing Claude request...';
      const userInfo = await memory.get('user_info');
      const messages = context.getMessagesForAPI();

      const systemPrompt = `You are helping ${userInfo?.value.name} who prefers ${userInfo?.value.preferences.language} and ${userInfo?.value.preferences.framework}.`;

      // Send to Claude with context
      spinner.text = 'Sending contextual request to Claude...';
      const response = await claude.sendMessage(messages, {
        systemPrompt,
        maxTokens: 500
      });

      // Store response in context
      await context.addMessage({
        role: 'assistant',
        content: response.content
      });

      // Store conversation summary in memory
      spinner.text = 'Storing conversation summary...';
      await memory.store('conversation_summary', {
        topic: 'React TypeScript Setup',
        timestamp: new Date(),
        messageCount: context.getStats().currentWindowSize
      }, {
        type: 'short-term',
        importance: 0.7,
        tags: ['conversation', 'summary'],
        ttl: 3600000 // 1 hour
      });

      spinner.succeed(chalk.green('Integrated test successful!'));
      console.log(chalk.cyan('\nIntegrated Results:'));
      console.log('  ✓ Memory service initialized and storing data');
      console.log('  ✓ Context service managing conversation');
      console.log('  ✓ Claude service responding with context');
      console.log(`  ✓ Response length: ${response.content.length} characters`);
      console.log(`  ✓ Tokens used: ${response.usage?.totalTokens || 'N/A'}`);

      // Cleanup
      await memory.clear('all');

    } catch (error) {
      spinner.fail(chalk.red('Integrated test failed'));
      console.error(error);
    }
  });

program
  .command('all')
  .description('Run all tests')
  .action(async () => {
    console.log(chalk.cyan('Running all AI service tests...\n'));

    // Run each test in sequence
    await program.commands.find(cmd => cmd.name() === 'memory')?.parseAsync(['', '']);
    console.log('');

    await program.commands.find(cmd => cmd.name() === 'context')?.parseAsync(['', '']);
    console.log('');

    if (process.env.ANTHROPIC_API_KEY) {
      await program.commands.find(cmd => cmd.name() === 'claude')?.parseAsync(['', '']);
      console.log('');

      await program.commands.find(cmd => cmd.name() === 'integrated')?.parseAsync(['', '']);
    } else {
      console.log(chalk.yellow('Skipping Claude tests - ANTHROPIC_API_KEY not set'));
    }

    console.log(chalk.green('\n✓ All tests completed!'));
  });

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}